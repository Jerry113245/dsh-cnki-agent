#!/usr/bin/env python3
"""CNKIAgent · 论文插图生成器（原生矢量，不糊）。

把「节点 + 连线」的 JSON 规格渲染成三种产物：
  docx  原生 DrawingML 形状组（真矢量，Word 里可选中、可改字、可调色、可缩放）
  svg   矢量文件，供 Visio / draw.io / Illustrator 二次编辑
  png   600 dpi 位图，供只收位图的投稿系统

用法：
  python draw_diagram.py build spec.json out.docx
  python draw_diagram.py build spec.json out.svg
  python draw_diagram.py build spec.json out.png --dpi 600
  python draw_diagram.py demo  demo.docx

规格（spec.json）：
{
  "title": "图 2-1 系统架构",
  "direction": "TB",                       // TB 竖排 / LR 横排
  "nodes": [
    {"id": "a", "label": "用户层", "shape": "round"},
    {"id": "b", "label": "是否达标？", "shape": "diamond"},
    {"id": "c", "label": "输出", "shape": "terminator", "level": 2}
  ],
  "edges": [
    {"from": "a", "to": "b", "label": "请求"},
    {"from": "b", "to": "c", "label": "是", "dashed": true}
  ]
}

shape 可选：rect 矩形 / round 圆角 / terminator 起止 / diamond 判断 / ellipse 圆 /
            parallelogram 数据 / cylinder 存储 / hexagon 准备

不写 level 时按最长路径自动分层；写了 level 就按指定层排（用于手工微调）。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape

# ------------------------------------------------------------------ 基础量

PT = 12700                     # 1 pt = 12700 EMU
BOX_W, BOX_H = 132.0, 44.0     # 节点默认尺寸（pt）
GAP_X, GAP_Y = 26.0, 42.0      # 层内间距 / 层间距
MARGIN = 10.0

SHAPE_PRESET = {
    'rect': 'rect',
    'round': 'roundRect',
    'terminator': 'roundRect',
    'diamond': 'diamond',
    'ellipse': 'ellipse',
    'parallelogram': 'parallelogram',
    'cylinder': 'can',
    'hexagon': 'hexagon',
}

SHAPE_FILL = {
    'rect': 'EAF1FB',
    'round': 'EAF1FB',
    'terminator': 'E2EFDA',
    'diamond': 'FFF2CC',
    'ellipse': 'F2E9FA',
    'parallelogram': 'FDEDE6',
    'cylinder': 'EDEDED',
    'hexagon': 'E6F4F1',
}

LINE_COLOR = '2F5597'
TEXT_COLOR = '1F1F1F'
FONT_CJK = '宋体'
FONT_LATIN = 'Times New Roman'
FONT_PT = 10.5


# ------------------------------------------------------------------ 布局

def _levels(nodes, edges):
    """最长路径分层；节点显式给了 level 就用显式值当锚点。"""
    ids = [n['id'] for n in nodes]
    pinned = {n['id']: n['level'] for n in nodes if isinstance(n.get('level'), int)}
    level = {i: pinned.get(i, 0) for i in ids}
    out = {i: [] for i in ids}
    indeg = {i: 0 for i in ids}
    for e in edges:
        if e['from'] in out and e['to'] in indeg:
            out[e['from']].append(e['to'])
            indeg[e['to']] += 1

    roots = [i for i in ids if indeg[i] == 0] or ids[:1]
    for r in roots:
        level[r] = max(level[r], pinned.get(r, 0) if r in pinned else 0)
    # 迭代松弛（有环也会收敛，因为有上限）
    for _ in range(len(ids) + 1):
        changed = False
        for i in ids:
            if i in pinned:
                continue
            if not out[i]:
                continue
            want = max(level[nbr] for nbr in out[i]) - 1 if False else None
            _ = want
        for e in edges:
            u, v = e['from'], e['to']
            if u not in level or v not in level:
                continue
            if v in pinned:
                continue
            target = level[u] + 1
            if level[v] < target:
                level[v] = target
                changed = True
        if not changed:
            break
    # 归一化，保证从 0 开始连续
    return {i: level[i] for i in ids}


def _order_within_levels(nodes, edges, level, layers):
    """重心法降交叉：按邻层平均位置排序，两个来回。"""
    order = {lv: [n['id'] for n in nodes if level[n['id']] == lv] for lv in layers}
    nbrs = {n['id']: set() for n in nodes}
    for e in edges:
        if e['from'] in nbrs and e['to'] in nbrs:
            nbrs[e['from']].add(e['to'])
            nbrs[e['to']].add(e['from'])

    def pos_map(lv):
        return {nid: idx for idx, nid in enumerate(order[lv])}

    for sweep in range(2):
        seq = layers if sweep == 0 else list(reversed(layers))
        for lv in seq:
            ref_lv = lv - 1 if sweep == 0 else lv + 1
            if ref_lv not in order:
                continue
            ref = pos_map(ref_lv)
            def key(nid):
                ns = [ref[n] for n in nbrs[nid] if n in ref]
                return (sum(ns) / len(ns)) if ns else 1e9
            order[lv].sort(key=key)
    return order


def layout(spec):
    """返回 {'nodes': {id: (x, y, w, h, label, shape)}, 'edges': [...], 'W','H'}（单位 pt）。"""
    nodes = spec.get('nodes') or []
    edges = spec.get('edges') or []
    if not nodes:
        raise SystemExit('spec 里没有 nodes')

    level = _levels(nodes, edges)
    layers = sorted(set(level.values()))
    order = _order_within_levels(nodes, edges, level, layers)

    def size(n):
        w = float(n.get('w') or BOX_W)
        h = float(n.get('h') or BOX_H)
        if n.get('shape') == 'diamond':
            w, h = w * 1.45, h * 1.62
        return w, h

    sizes = {n['id']: size(n) for n in nodes}
    widths = {lv: sum(sizes[i][0] for i in order[lv]) + GAP_X * (len(order[lv]) - 1) for lv in layers}
    canvas_w = max(widths.values()) + MARGIN * 2
    layer_h = {lv: max(sizes[i][1] for i in order[lv]) for lv in layers}

    geo = {}
    y = MARGIN
    for lv in layers:
        x = (canvas_w - widths[lv]) / 2
        for nid in order[lv]:
            w, h = sizes[nid]
            geo[nid] = (x, y + (layer_h[lv] - h) / 2, w, h)
            x += w + GAP_X
        y += layer_h[lv] + GAP_Y
    canvas_h = y - GAP_Y + MARGIN

    by_id = {n['id']: n for n in nodes}

    # 跨度 > 1 的边与回边走右侧通道，避免穿过中间层节点
    side = []
    for e in edges:
        if e['from'] in level and e['to'] in level:
            if level[e['to']] - level[e['from']] != 1:
                side.append(e)
    channel_x = None
    if side:
        canvas_w += 24
        channel_x = canvas_w - 11

    out = {'W': canvas_w, 'H': canvas_h, 'nodes': {}, 'edges': [], 'direction': spec.get('direction', 'TB')}
    for nid, (x, ny, w, h) in geo.items():
        n = by_id[nid]
        out['nodes'][nid] = {
            'x': x, 'y': ny, 'w': w, 'h': h,
            'label': str(n.get('label') or nid),
            'shape': n.get('shape') or 'rect',
        }
    for e in edges:
        if e['from'] not in geo or e['to'] not in geo:
            continue
        span = level[e['to']] - level[e['from']]
        out['edges'].append(route(e, geo, span, out['direction'], channel_x))
    return out


def route(edge, geo, span, direction, channel_x=None):
    """折线路由：相邻层向下 → 横移 → 向下；跨层/回边走右侧通道。"""
    sx, sy, sw, sh = geo[edge['from']]
    tx, ty, tw, th = geo[edge['to']]
    scx, tcx = sx + sw / 2, tx + tw / 2
    segs = []

    if span == 1:
        y0, y1 = sy + sh, ty
        mid = y0 + (y1 - y0) / 2
        if abs(scx - tcx) < 0.5:
            segs.append((scx, y0, tcx, y1))
        else:
            segs.append((scx, y0, scx, mid))
            segs.append((scx, mid, tcx, mid))
            segs.append((tcx, mid, tcx, y1))
    else:
        cx = channel_x if channel_x is not None else max(sx + sw, tx + tw) + 16
        y_s = sy + sh / 2
        y_t = ty + th / 2
        segs.append((sx + sw, y_s, cx, y_s))
        segs.append((cx, y_s, cx, y_t))
        segs.append((cx, y_t, tx + tw, y_t))

    return {'segs': segs, 'label': str(edge.get('label') or ''), 'dashed': bool(edge.get('dashed'))}


# ------------------------------------------------------------------ SVG

def to_svg(g):
    W, H = g['W'], g['H']
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.1f}pt" height="{H:.1f}pt" '
        f'viewBox="0 0 {W:.2f} {H:.2f}">',
        f'<rect x="0" y="0" width="{W:.2f}" height="{H:.2f}" fill="#FFFFFF"/>',
        '<defs><marker id="arw" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">'
        '<path d="M0,0 L8,3 L0,6 z" fill="#%s"/></marker></defs>' % LINE_COLOR,
    ]
    for e in g['edges']:
        dash = ' stroke-dasharray="4 3"' if e['dashed'] else ''
        for i, (x1, y1, x2, y2) in enumerate(e['segs']):
            last = ' marker-end="url(#arw)"' if i == len(e['segs']) - 1 else ''
            parts.append(
                f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
                f'stroke="#{LINE_COLOR}" stroke-width="1.2"{dash}{last}/>'
            )
        if e['label']:
            x1, y1, x2, y2 = e['segs'][0]
            parts.append(
                f'<text x="{(x1 + x2) / 2 + 5:.2f}" y="{(y1 + y2) / 2 - 4:.2f}" '
                f'font-family="{FONT_CJK}" font-size="{FONT_PT - 1}" fill="#{TEXT_COLOR}">'
                f'{escape(e["label"])}</text>'
            )

    for nid, n in g['nodes'].items():
        x, y, w, h = n['x'], n['y'], n['w'], n['h']
        fill = SHAPE_FILL.get(n['shape'], 'EAF1FB')
        shape = n['shape']
        if shape in ('round',):
            parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="8" ry="8" '
                         f'fill="#{fill}" stroke="#{LINE_COLOR}" stroke-width="1.2"/>')
        elif shape == 'terminator':
            parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{h / 2:.2f}" '
                         f'ry="{h / 2:.2f}" fill="#{fill}" stroke="#{LINE_COLOR}" stroke-width="1.2"/>')
        elif shape == 'diamond':
            cx, cy = x + w / 2, y + h / 2
            parts.append(f'<polygon points="{cx:.2f},{y:.2f} {x + w:.2f},{cy:.2f} {cx:.2f},{y + h:.2f} {x:.2f},{cy:.2f}" '
                         f'fill="#{fill}" stroke="#{LINE_COLOR}" stroke-width="1.2"/>')
        elif shape == 'ellipse':
            parts.append(f'<ellipse cx="{x + w / 2:.2f}" cy="{y + h / 2:.2f}" rx="{w / 2:.2f}" ry="{h / 2:.2f}" '
                         f'fill="#{fill}" stroke="#{LINE_COLOR}" stroke-width="1.2"/>')
        else:
            parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
                         f'fill="#{fill}" stroke="#{LINE_COLOR}" stroke-width="1.2"/>')
        parts.append(
            f'<text x="{x + w / 2:.2f}" y="{y + h / 2:.2f}" text-anchor="middle" dominant-baseline="central" '
            f'font-family="{FONT_CJK}" font-size="{FONT_PT}" fill="#{TEXT_COLOR}">{escape(n["label"])}</text>'
        )
    parts.append('</svg>')
    return '\n'.join(parts)


# ------------------------------------------------------------------ DrawingML（原生矢量形状组）

NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
)


def _emu(v):
    return int(round(v * PT))


def _wsp_shape(shape_id, x, y, w, h, prst, fill, text=None, adj=None, inset=22860, size_pt=FONT_PT):
    geom = f'<a:prstGeom prst="{prst}"><a:avLst>'
    if adj:
        geom += f'<a:gd name="adj" fmla="val {adj}"/>'
    geom += '</a:avLst></a:prstGeom>'
    body = ''
    if text:
        body = (
            '<wps:txbx><w:txbxContent>'
            '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
            '<w:r><w:rPr>'
            f'<w:rFonts w:ascii="{FONT_LATIN}" w:hAnsi="{FONT_LATIN}" w:eastAsia="{FONT_CJK}"/>'
            f'<w:sz w:val="{int(size_pt * 2)}"/><w:color w:val="{TEXT_COLOR}"/>'
            '</w:rPr>'
            f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
            '</w:txbxContent></wps:txbx>'
        )
    return (
        '<wps:wsp>'
        f'<wps:cNvPr id="{shape_id}" name="s{shape_id}"/><wps:cNvSpPr/>'
        '<wps:spPr>'
        f'<a:xfrm><a:off x="{_emu(x)}" y="{_emu(y)}"/><a:ext cx="{_emu(w)}" cy="{_emu(h)}"/></a:xfrm>'
        f'{geom}'
        f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>'
        f'<a:ln w="{int(1.2 * PT)}"><a:solidFill><a:srgbClr val="{LINE_COLOR}"/></a:solidFill></a:ln>'
        '</wps:spPr>'
        f'{body}'
        f'<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="{inset}" tIns="0" rIns="{inset}" bIns="0" '
        'anchor="ctr" anchorCtr="0"><a:noAutofit/></wps:bodyPr>'
        '</wps:wsp>'
    )


def _wsp_text(shape_id, x, y, w, h, text, size_pt=9.0):
    """无边框无填充的纯文字块，用来放连线标签。"""
    return (
        '<wps:wsp>'
        f'<wps:cNvPr id="{shape_id}" name="t{shape_id}"/><wps:cNvSpPr txBox="1"/>'
        '<wps:spPr>'
        f'<a:xfrm><a:off x="{_emu(x)}" y="{_emu(y)}"/><a:ext cx="{_emu(w)}" cy="{_emu(h)}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        '<a:noFill/><a:ln><a:noFill/></a:ln>'
        '</wps:spPr>'
        '<wps:txbx><w:txbxContent>'
        '<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
        '<w:r><w:rPr>'
        f'<w:rFonts w:ascii="{FONT_LATIN}" w:hAnsi="{FONT_LATIN}" w:eastAsia="{FONT_CJK}"/>'
        f'<w:sz w:val="{int(size_pt * 2)}"/><w:color w:val="{TEXT_COLOR}"/>'
        '</w:rPr>'
        f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
        '</w:txbxContent></wps:txbx>'
        '<wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" '
        'anchor="ctr" anchorCtr="0"><a:noAutofit/></wps:bodyPr>'
        '</wps:wsp>'
    )


def _wsp_line(shape_id, x1, y1, x2, y2, arrow, dashed):
    left, top = min(x1, x2), min(y1, y2)
    w, h = abs(x2 - x1), abs(y2 - y1)
    flip = ''
    if x2 < x1:
        flip += ' flipH="1"'
    if y2 < y1:
        flip += ' flipV="1"'
    dash = '<a:prstDash val="dash"/>' if dashed else '<a:prstDash val="solid"/>'
    tail = '<a:tailEnd type="triangle" w="med" len="med"/>' if arrow else ''
    return (
        '<wps:wsp>'
        f'<wps:cNvPr id="{shape_id}" name="l{shape_id}"/><wps:cNvSpPr/>'
        '<wps:spPr>'
        f'<a:xfrm{flip}><a:off x="{_emu(left)}" y="{_emu(top)}"/><a:ext cx="{_emu(max(w, 0.1))}" cy="{_emu(max(h, 0.1))}"/></a:xfrm>'
        '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>'
        f'<a:ln w="{int(1.2 * PT)}"><a:solidFill><a:srgbClr val="{LINE_COLOR}"/></a:solidFill>{dash}{tail}</a:ln>'
        '</wps:spPr>'
        '</wps:wsp>'
    )


def to_drawing_xml(g, docpr_id=1):
    """整张图作为一个形状组，inline 锚定在一个段落里。"""
    W, H = g['W'], g['H']
    children = []
    sid = 2
    # 先画线，再画节点（节点盖住线头），最后画连线标签（保证在最上层）
    for e in g['edges']:
        for i, (x1, y1, x2, y2) in enumerate(e['segs']):
            children.append(_wsp_line(sid, x1, y1, x2, y2, i == len(e['segs']) - 1, e['dashed']))
            sid += 1
    for nid, n in g['nodes'].items():
        shape = n['shape']
        prst = SHAPE_PRESET.get(shape, 'rect')
        adj = '30000' if shape == 'round' else None
        inset = 0 if shape in ('diamond', 'ellipse') else 22860
        children.append(_wsp_shape(sid, n['x'], n['y'], n['w'], n['h'], prst,
                                   SHAPE_FILL.get(shape, 'EAF1FB'), n['label'], adj, inset))
        sid += 1
    for e in g['edges']:
        if not e['label']:
            continue
        x1, y1, x2, y2 = e['segs'][0]
        lw, lh = 46.0, 13.0
        lx = (x1 + x2) / 2 + 4 if abs(x2 - x1) < 1 else max(x1, x2) + 4
        ly = (y1 + y2) / 2 - lh / 2
        children.append(_wsp_text(sid, lx, ly, lw, lh, e['label']))
        sid += 1

    return (
        f'<w:p {NS}><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing>'
        f'<wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{_emu(W)}" cy="{_emu(H)}"/>'
        f'<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{docpr_id}" name="diagram{docpr_id}"/>'
        '<wp:cNvGraphicFramePr/>'
        '<a:graphic>'
        '<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">'
        '<wpg:wgp>'
        '<wpg:cNvGrpSpPr/>'
        '<wpg:grpSpPr>'
        '<a:xfrm><a:off x="0" y="0"/>'
        f'<a:ext cx="{_emu(W)}" cy="{_emu(H)}"/>'
        f'<a:chOff x="0" y="0"/><a:chExt cx="{_emu(W)}" cy="{_emu(H)}"/></a:xfrm>'
        '</wpg:grpSpPr>'
        + ''.join(children) +
        '</wpg:wgp>'
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


def write_docx(g, out, title=None, caption=None):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import parse_xml
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt

    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = sec.bottom_margin = Cm(2.54)
    sec.left_margin = sec.right_margin = Cm(3.0)

    def cjk(run, size=12, bold=False):
        run.font.name = FONT_LATIN
        run.font.size = Pt(size)
        run.font.bold = bold
        rpr = run._element.get_or_add_rPr()
        rfonts = rpr.find(qn('w:rFonts'))
        if rfonts is None:
            rfonts = rpr.makeelement(qn('w:rFonts'), {})
            rpr.append(rfonts)
        rfonts.set(qn('w:eastAsia'), FONT_CJK)

    if title and not caption:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cjk(p.add_run(title), 16, True)

    body = doc.add_paragraph()
    body._p.addnext(parse_xml(to_drawing_xml(g, docpr_id=1)))

    if caption:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cjk(p.add_run(caption), 10.5)

    doc.save(str(out))
    return {'output': str(out), 'kind': 'docx', 'shapes': len(g['nodes']) + sum(len(e['segs']) for e in g['edges'])}


# ------------------------------------------------------------------ PNG

def write_png(g, out, dpi=600):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise SystemExit('缺少 Pillow，无法输出 PNG；可先用 svg / docx')
    scale = dpi / 72.0
    W = int(math.ceil(g['W'] * scale))
    H = int(math.ceil(g['H'] * scale))
    img = Image.new('RGB', (W, H), 'white')
    dr = ImageDraw.Draw(img)

    font = None
    for cand in ('C:/Windows/Fonts/simsun.ttc', 'C:/Windows/Fonts/msyh.ttc',
                 'C:/Windows/Fonts/simhei.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if Path(cand).exists():
            try:
                font = ImageFont.truetype(cand, int(FONT_PT * scale))
                break
            except OSError:
                continue
    if font is None:
        font = ImageFont.load_default()

    def S(v):
        return int(round(v * scale))

    for e in g['edges']:
        for i, (x1, y1, x2, y2) in enumerate(e['segs']):
            dr.line([S(x1), S(y1), S(x2), S(y2)], fill='#' + LINE_COLOR, width=max(1, int(1.2 * scale)))
            if i == len(e['segs']) - 1:
                ang = math.atan2(y2 - y1, x2 - x1)
                L, A = 9.0, 0.17           # 单位 pt，交给 S() 换算，别再乘 scale
                dr.polygon([
                    (S(x2), S(y2)),
                    (S(x2 - L * math.cos(ang - A)), S(y2 - L * math.sin(ang - A))),
                    (S(x2 - L * math.cos(ang + A)), S(y2 - L * math.sin(ang + A))),
                ], fill='#' + LINE_COLOR)
        if e['label']:
            x1, y1, x2, y2 = e['segs'][0]
            dr.text((S((x1 + x2) / 2 + 5), S((y1 + y2) / 2 - 10)), e['label'],
                    fill='#' + TEXT_COLOR, font=font)

    for nid, n in g['nodes'].items():
        box = [S(n['x']), S(n['y']), S(n['x'] + n['w']), S(n['y'] + n['h'])]
        fill = '#' + SHAPE_FILL.get(n['shape'], 'EAF1FB')
        line = '#' + LINE_COLOR
        wpx = max(1, int(1.2 * scale))
        if n['shape'] == 'diamond':
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            dr.polygon([(cx, box[1]), (box[2], cy), (cx, box[3]), (box[0], cy)], fill=fill, outline=line, width=wpx)
        elif n['shape'] == 'ellipse':
            dr.ellipse(box, fill=fill, outline=line, width=wpx)
        elif n['shape'] == 'hexagon':
            k = (box[2] - box[0]) * 0.18
            cy = (box[1] + box[3]) / 2
            dr.polygon([(box[0] + k, box[1]), (box[2] - k, box[1]), (box[2], cy),
                        (box[2] - k, box[3]), (box[0] + k, box[3]), (box[0], cy)],
                       fill=fill, outline=line, width=wpx)
        elif n['shape'] == 'parallelogram':
            k = (box[2] - box[0]) * 0.18
            dr.polygon([(box[0] + k, box[1]), (box[2], box[1]), (box[2] - k, box[3]), (box[0], box[3])],
                       fill=fill, outline=line, width=wpx)
        elif n['shape'] == 'cylinder':
            eh = int((box[3] - box[1]) * 0.22)
            dr.rectangle([box[0], box[1] + eh // 2, box[2], box[3] - eh // 2], fill=fill, outline=line, width=wpx)
            dr.ellipse([box[0], box[1], box[2], box[1] + eh], fill=fill, outline=line, width=wpx)
            dr.line([box[0], box[1] + eh // 2, box[0], box[3] - eh // 2], fill=line, width=wpx)
            dr.line([box[2], box[1] + eh // 2, box[2], box[3] - eh // 2], fill=line, width=wpx)
            dr.arc([box[0], box[3] - eh, box[2], box[3]], 0, 180, fill=line, width=wpx)
        elif n['shape'] in ('round', 'terminator'):
            r = box[3] - box[1] if n['shape'] == 'terminator' else S(8)
            dr.rounded_rectangle(box, radius=r // 2 if n['shape'] == 'terminator' else r,
                                 fill=fill, outline=line, width=wpx)
        else:
            dr.rectangle(box, fill=fill, outline=line, width=wpx)
        tb = dr.textbbox((0, 0), n['label'], font=font)
        dr.text(((box[0] + box[2]) / 2 - (tb[2] - tb[0]) / 2,
                 (box[1] + box[3]) / 2 - (tb[3] - tb[1]) / 2 - tb[1]),
                n['label'], fill='#' + TEXT_COLOR, font=font)

    img.save(str(out), 'PNG', dpi=(dpi, dpi))
    return {'output': str(out), 'kind': 'png', 'dpi': dpi, 'pixels': [W, H]}


# ------------------------------------------------------------------ CLI

DEMO = {
    'title': '图 2-1 系统总体架构',
    'direction': 'TB',
    'nodes': [
        {'id': 'u', 'label': '用户层', 'shape': 'terminator'},
        {'id': 'a', 'label': '接入网关', 'shape': 'round'},
        {'id': 's', 'label': '业务服务', 'shape': 'rect'},
        {'id': 'd', 'label': '数据是否合规？', 'shape': 'diamond'},
        {'id': 'db', 'label': '数据仓库', 'shape': 'cylinder'},
        {'id': 'o', 'label': '结果输出', 'shape': 'terminator'},
    ],
    'edges': [
        {'from': 'u', 'to': 'a', 'label': '请求'},
        {'from': 'a', 'to': 's'},
        {'from': 's', 'to': 'd', 'label': '校验'},
        {'from': 'd', 'to': 'db', 'label': '是'},
        {'from': 'd', 'to': 'o', 'label': '否', 'dashed': True},
        {'from': 'db', 'to': 'o'},
    ],
}


def main(argv=None):
    ap = argparse.ArgumentParser(description='论文插图生成器（原生矢量）')
    sub = ap.add_subparsers(dest='cmd', required=True)

    b = sub.add_parser('build', help='按规格生成图')
    b.add_argument('spec')
    b.add_argument('out')
    b.add_argument('--title', default=None)
    b.add_argument('--caption', default=None)
    b.add_argument('--dpi', type=int, default=600)

    d = sub.add_parser('demo', help='生成内置示例')
    d.add_argument('out')
    d.add_argument('--title', default=None)
    d.add_argument('--caption', default=None)
    d.add_argument('--dpi', type=int, default=600)

    args = ap.parse_args(argv)
    if args.cmd == 'demo':
        spec = DEMO
        out = Path(args.out)
    else:
        spec = json.loads(Path(args.spec).read_text(encoding='utf-8'))
        out = Path(args.out)

    g = layout(spec)
    suffix = out.suffix.lower()
    if suffix == '.svg':
        out.write_text(to_svg(g), encoding='utf-8')
        res = {'output': str(out), 'kind': 'svg', 'size_pt': [round(g['W'], 1), round(g['H'], 1)]}
    elif suffix == '.png':
        res = write_png(g, out, args.dpi)
    elif suffix == '.docx':
        res = write_docx(g, out, args.title or spec.get('title'), args.caption)
    else:
        raise SystemExit('输出后缀只支持 .docx / .svg / .png')

    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
