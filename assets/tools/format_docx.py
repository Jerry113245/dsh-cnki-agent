#!/usr/bin/env python3
"""CNKIAgent · 论文排版体检与修复 / DOCX 生成。

子命令：
  check   体检一份 .docx 的排版问题（编号、交叉引用、三线表、字体、样式、占位符）
  build   从 Markdown 生成带样式骨架的 .docx（标题样式 / 正文缩进 / 三线表 / 题注域 / 页码）

用法：
  python format_docx.py check  thesis.docx
  python format_docx.py build  thesis.md out.docx --title "论文题目" --cjk 宋体 --latin "Times New Roman"

依赖 python-docx（DSH 运行时自带）。本脚本不造 OMML 公式，公式一律保留为文本并提示人工转公式。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt
except ImportError:  # pragma: no cover
    print('缺少 python-docx：请用 DSH 运行时的 python 执行本脚本', file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------- 通用工具

def set_cjk_font(run, cjk='宋体', latin='Times New Roman', size_pt=12.0, bold=False):
    """同时设置西文与中文字体（只设 font.name 中文不会生效）。"""
    run.font.name = latin
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = rpr.makeelement(qn('w:rFonts'), {})
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), cjk)
    rfonts.set(qn('w:ascii'), latin)
    rfonts.set(qn('w:hAnsi'), latin)


def first_line_indent_chars(paragraph, chars=2):
    """首行缩进 N 字符（用 firstLineChars，避免按字号换算错位）。"""
    ppr = paragraph._p.get_or_add_pPr()
    ind = ppr.find(qn('w:ind'))
    if ind is None:
        ind = ppr.makeelement(qn('w:ind'), {})
        ppr.append(ind)
    ind.set(qn('w:firstLineChars'), str(chars * 100))
    ind.set(qn('w:firstLine'), str(int(chars * 240)))


def add_field(paragraph, instr, placeholder='1'):
    """插入简单域，如 'SEQ 图 \\* ARABIC'、'PAGE'、'REF _Ref1 \\h'。"""
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), instr)
    run = OxmlElement('w:r')
    text = OxmlElement('w:t')
    text.text = placeholder
    run.append(text)
    fld.append(run)
    paragraph._p.append(fld)


def set_cell_borders(cell, edges):
    """edges: {'top': sz, 'bottom': sz, 'left': 0, 'right': 0}，sz 单位 1/8 磅。"""
    tcpr = cell._tc.get_or_add_tcPr()
    borders = tcpr.find(qn('w:tcBorders'))
    if borders is None:
        borders = tcpr.makeelement(qn('w:tcBorders'), {})
        tcpr.append(borders)
    for edge in ('top', 'left', 'bottom', 'right'):
        if edge not in edges:
            continue
        sz = edges[edge]
        el = borders.find(qn(f'w:{edge}'))
        if el is None:
            el = borders.makeelement(qn(f'w:{edge}'), {})
            borders.append(el)
        el.set(qn('w:val'), 'nil' if sz == 0 else 'single')
        el.set(qn('w:sz'), str(sz))
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), '000000')


def apply_three_line(table, top_sz=12, mid_sz=6, bottom_sz=12):
    """三线表：顶线/底线粗、栏目线细、无竖线。sz 单位 1/8 磅（12=1.5磅，6=0.75磅）。"""
    rows = list(table.rows)
    if not rows:
        return
    last = len(rows) - 1
    for index, row in enumerate(rows):
        for cell in row.cells:
            edges = {'top': 0, 'left': 0, 'bottom': 0, 'right': 0}
            if index == 0:
                edges['top'] = top_sz
                edges['bottom'] = mid_sz
            if index == last:
                edges['bottom'] = bottom_sz
            set_cell_borders(cell, edges)
        if index == 0:
            trpr = row._tr.get_or_add_trPr()
            header = OxmlElement('w:tblHeader')
            header.set(qn('w:val'), 'true')
            trpr.append(header)


def add_page_number_footer(section):
    para = section.footer.paragraphs[0]
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_field(para, 'PAGE', '1')


# ---------------------------------------------------------------- check

NUMBER_PATTERNS = {
    '图 手打编号': re.compile(r'^\s*图\s*\d', re.M),
    '表 手打编号': re.compile(r'^\s*表\s*\d', re.M),
    '公式 手打编号': re.compile(r'[（(]\s*\d+\s*[-–.]?\s*\d*\s*[)）]\s*$', re.M),
}

FOREIGN_FONTS = ('Calibri', 'Cambria', '等线', 'Arial')


def check_docx(path: Path) -> dict:
    doc = Document(str(path))
    issues: list[dict] = []

    def add(level, code, detail, hint):
        issues.append({'level': level, 'code': code, 'detail': detail, 'hint': hint})

    # 1) 域与交叉引用
    xml = doc.element.xml
    field_count = xml.count('fldSimple') + xml.count('instrText')
    seq_count = len(re.findall(r'SEQ\s', xml))
    ref_count = len(re.findall(r'\bREF\s', xml))
    has_error_bookmark = '错误！未定义书签' in xml or 'Error! Bookmark not defined' in xml
    if has_error_bookmark:
        add('error', 'BOOKMARK_BROKEN', '文档中存在「错误！未定义书签」',
            '删除失效字段，重新插入交叉引用；F9 修不好')
    if field_count == 0:
        add('warn', 'NO_FIELDS', '全文没有任何域（编号或页码可能是手打的）',
            '图/表/公式编号改用 SEQ 域，页码用 PAGE 域')

    # 2) 题注与手打编号
    captions = [p for p in doc.paragraphs if p.style.name.lower().startswith('caption')
                or re.match(r'^\s*[图表]\s*\d', p.text or '')]
    if captions and seq_count == 0:
        add('warn', 'CAPTION_WITHOUT_SEQ',
            f'发现 {len(captions)} 条题注但正文没有 SEQ 域',
            '题注编号应是 { SEQ 图 \\* ARABIC } 之类的域，不是手打数字')
    body_no_caption = [p for p in doc.paragraphs
                       if not (p.style.name.lower().startswith('caption'))]
    for p in body_no_caption:
        text = p.text or ''
        if re.search(r'如图\s*\d', text) or re.search(r'见表\s*\d', text):
            if ref_count == 0:
                add('warn', 'CROSSREF_MISSING', f'正文疑似手打引用：{text[:36]}',
                    '用「引用 → 交叉引用」插 REF 域，或改用领域工具（Zotero/EndNote）')
                break

    # 3) 样式与字体
    manual_font = 0
    foreign = set()
    for p in doc.paragraphs:
        for run in p.runs:
            rpr = run._element.rPr
            if rpr is not None and rpr.find(qn('w:rFonts')) is not None:
                manual_font += 1
            name = run.font.name or ''
            if name in FOREIGN_FONTS:
                foreign.add(name)
    if manual_font > 40:
        add('info', 'MANUAL_FONTS', f'{manual_font} 处 run 直接设了字体（而非走样式）',
            '统一改样式定义，便于一次性调整全篇')
    if foreign:
        add('warn', 'FOREIGN_FONTS', f'出现非规范西文字体：{"、".join(sorted(foreign))}',
            '论文正文西文一般用 Times New Roman')

    has_heading = any((p.style.name or '').lower().startswith('heading') for p in doc.paragraphs)
    if not has_heading:
        add('warn', 'NO_HEADING_STYLE', '没有段落使用内置「标题」样式',
            '章标题必须套用内置标题样式，否则题注「包含章节号」读不到')

    # 4) 表格
    for index, table in enumerate(doc.tables, start=1):
        tbl_xml = table._tbl.xml
        vertical = re.search(r'<w:(insideV|left|right)[^/]*w:val="single"', tbl_xml)
        if vertical:
            add('warn', 'TABLE_VERTICAL_LINE', f'第 {index} 张表存在竖线',
                '论文表格用三线表：无竖线，只有顶线、栏目线、底线')
        if '</w:tbl>' in tbl_xml and 'tblHeader' not in tbl_xml and len(table.rows) > 8:
            add('info', 'TABLE_NO_HEADER_REPEAT', f'第 {index} 张表较长但没设重复标题行',
                '选中表头行 → 布局 → 重复标题行')

    # 5) 残留与占位
    residue = []
    for pattern, label in ((r'\*\*', 'Markdown 加粗 **'), (r'`', '反引号'),
                           (r'\]\(http', 'Markdown 链接'), (r'(?i)TODO|待补|待定|XXX', '占位符')):
        if re.search(pattern, xml):
            residue.append(label)
    if residue:
        add('error', 'RESIDUE', f'发现残留：{"、".join(residue)}', '导出前必须清理，否则进最终稿')

    # 6) 参考文献粗检
    refs = re.search(r'参考文献', '\n'.join(p.text or '' for p in doc.paragraphs))
    if refs:
        bracket_refs = re.findall(r'\[(\d+)\]', xml)
        if bracket_refs:
            nums = sorted({int(n) for n in bracket_refs})
            gaps = [n for n in range(1, max(nums) + 1) if n not in nums]
            if gaps:
                add('warn', 'REF_GAP', f'参考文献编号不连续，缺：{gaps}',
                    '顺序编码制必须从 [1] 起连续编号')

    stats = {
        'paragraphs': len(doc.paragraphs),
        'tables': len(doc.tables),
        'sections': len(doc.sections),
        'fields': field_count,
        'seq_fields': seq_count,
        'ref_fields': ref_count,
        'captions': len(captions),
    }
    return {'file': str(path), 'stats': stats, 'issues': issues}


def render_report(report: dict) -> str:
    lines = ['# 排版体检报告', '', f"- 文件：`{report['file']}`", '']
    stats = report['stats']
    lines += [
        '| 指标 | 数值 |', '|---|---|',
        f"| 段落 | {stats['paragraphs']} |",
        f"| 表格 | {stats['tables']} |",
        f"| 节 | {stats['sections']} |",
        f"| 域总数 | {stats['fields']} |",
        f"| SEQ 域 | {stats['seq_fields']} |",
        f"| REF 域 | {stats['ref_fields']} |",
        f"| 题注 | {stats['captions']} |",
        '', '## 问题清单', '',
    ]
    issues = report['issues']
    if not issues:
        lines.append('未发现明显排版问题。仍需在 Word 中 `Ctrl+A` → `F9` 后人工核对目录与页码。')
    else:
        icon = {'error': '✗', 'warn': '!', 'info': 'i'}
        lines += ['| 级别 | 代号 | 说明 | 处理建议 |', '|---|---|---|---|']
        for item in issues:
            lines.append(f"| {icon.get(item['level'], '?')} | {item['code']} | {item['detail']} | {item['hint']} |")
    lines += ['', '> 完整规则见 `references/word-playbook.md`。']
    return '\n'.join(lines)


# ---------------------------------------------------------------- build

def parse_markdown(md: str):
    """极简 Markdown → 块列表：heading / paragraph / table / code。"""
    blocks = []
    lines = md.replace('\r\n', '\n').split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.*)$', line)
        if m:
            blocks.append(('heading', len(m.group(1)), m.group(2).strip()))
            i += 1
            continue
        if line.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not re.match(r'^[\s:|-]+$', ''.join(cells)):
                    rows.append(cells)
                i += 1
            blocks.append(('table', rows))
            continue
        blocks.append(('paragraph', re.sub(r'\*\*(.+?)\*\*', r'\1', line.strip())))
        i += 1
    return blocks


def build_docx(md_path: Path, out_path: Path, title: str | None, cjk: str, latin: str):
    doc = Document()
    section = doc.sections[0]
    section.top_margin = section.bottom_margin = Cm(2.54)
    section.left_margin = section.right_margin = Cm(3.0)
    add_page_number_footer(section)

    if title:
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cjk_font(para.add_run(title), cjk, latin, 18, True)

    figure_no = 0
    table_no = 0
    for block in parse_markdown(md_path.read_text(encoding='utf-8')):
        kind = block[0]
        if kind == 'heading':
            level, text = block[1], block[2]
            para = doc.add_paragraph(style=f'Heading {min(level, 4)}')
            set_cjk_font(para.add_run(text), cjk, latin, {1: 18, 2: 15, 3: 14, 4: 12}[min(level, 4)], True)
        elif kind == 'paragraph':
            text = block[1]
            image = re.match(r'^!\[(.*?)\]\((.*?)\)$', text)
            if image:
                figure_no += 1
                cap = doc.add_paragraph(style='Caption')
                cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                set_cjk_font(cap.add_run('图 '), cjk, latin, 10.5)
                add_field(cap, 'SEQ 图 \\* ARABIC', str(figure_no))
                set_cjk_font(cap.add_run('  ' + (image.group(1) or '图题待补')), cjk, latin, 10.5)
                note = doc.add_paragraph()
                set_cjk_font(note.add_run(f'（图片占位：{image.group(2)}，请在 Word 中插入）'), cjk, latin, 9)
                continue
            para = doc.add_paragraph()
            first_line_indent_chars(para, 2)
            set_cjk_font(para.add_run(text), cjk, latin, 12)
        elif kind == 'table':
            rows = block[1]
            if not rows:
                continue
            table_no += 1
            cap = doc.add_paragraph(style='Caption')
            cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            set_cjk_font(cap.add_run('表 '), cjk, latin, 10.5)
            add_field(cap, 'SEQ 表 \\* ARABIC', str(table_no))
            set_cjk_font(cap.add_run('  ' + (rows[0][0] if rows and rows[0] else '表题待补')), cjk, latin, 10.5)
            width = max(len(r) for r in rows)
            table = doc.add_table(rows=len(rows), cols=width)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            for r, row in enumerate(rows):
                for c in range(width):
                    value = row[c] if c < len(row) else ''
                    cell_para = table.cell(r, c).paragraphs[0]
                    cell_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    set_cjk_font(cell_para.add_run(value), cjk, latin, 10.5)
            apply_three_line(table)

    doc.save(str(out_path))
    return {'output': str(out_path), 'figures': figure_no, 'tables': table_no}


# ---------------------------------------------------------------- CLI

def main(argv=None):
    parser = argparse.ArgumentParser(description='CNKIAgent 论文排版工具')
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_check = sub.add_parser('check', help='体检 .docx')
    p_check.add_argument('path')
    p_check.add_argument('--json', action='store_true', help='输出 JSON')

    p_build = sub.add_parser('build', help='从 Markdown 生成 .docx')
    p_build.add_argument('md')
    p_build.add_argument('out')
    p_build.add_argument('--title', default=None)
    p_build.add_argument('--cjk', default='宋体')
    p_build.add_argument('--latin', default='Times New Roman')

    args = parser.parse_args(argv)
    if args.cmd == 'check':
        report = check_docx(Path(args.path))
        print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render_report(report))
        return 1 if any(i['level'] == 'error' for i in report['issues']) else 0

    result = build_docx(Path(args.md), Path(args.out), args.title, args.cjk, args.latin)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
