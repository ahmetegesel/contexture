export const SHAPES = 'a reference is <owner>#<path>, one token without blanks, control characters, or double quotes (ERR_INVALID_ARGUMENT)';
export const BAD_REFS = ['free text reference', 'bareword', '#slug', 'a b#c', '', 'unit#x y', 'unit#x\fy', 'store#"quoted"', 'Owner#x', 'unit#'];
export const GOOD_REFS = ['unit#u1/entry/2026-09-27-e3-t', 'unit#u1/lane/l1/report/VERDICT', 'unit#u1/lane/l1/journal/2026-09-27-x', 'file#src/a.sh#fn', 'file#./README.md', 'file#/abs/file', 'file#../x', 'store#ideas/rust-driver', 'docs#workspace/the-record/header', 'memos#x', 'a.b-c_d#p#q'];
export const latin1 = (s: string): Buffer => Buffer.from(s, 'latin1');
export const NOT_UTF8 = [latin1('bad \xff byte'), ...['\x80', '\xc0\x80', '\xed\xa0\x80', 'x \xe2\x82', '\xf4\x90\x80\x80', '\xf8\x88\x80\x80\x80', '\xfe'].map((seq) => latin1(`a ${seq} b`))];
export const UTF8_OK = 'ascii, çalışma, 日本, \u{1f600}';
