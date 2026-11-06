export const SHAPES = 'a reference is <target>#<symbol> or a whole target path holding a / and ending in a name (a root-level file as ./<file>), one token without blanks, control characters, or double quotes (ERR_INVALID_ARGUMENT)';
export const BAD_REFS = ['free text reference', 'bareword', 'journal#', '#slug', 'journal#"quoted"', 'a b#c', 'README.md', '', '/', '//', 'a/', 'lanes/', './', 'journal#x\fy', 'lanes/x\vy', 'journal#x y', 'lanes/x y'];
export const GOOD_REFS = ['journal#2026-09-27-e3-t', 'lanes/e3-lane/recipe', 'src/a.sh#fn', './README.md', 'README.md#top', '/abs/file', '../x', 'lanes/l/recipe', 'journal#x', '###', 'knowledge#E3_ONE', 'docs/the-record.md', 'lanes/e3-lane/report#claim'];
export const latin1 = (s: string): Buffer => Buffer.from(s, 'latin1');
export const NOT_UTF8 = [latin1('bad \xff byte'), ...['\x80', '\xc0\x80', '\xed\xa0\x80', 'x \xe2\x82', '\xf4\x90\x80\x80', '\xf8\x88\x80\x80\x80', '\xfe'].map((seq) => latin1(`a ${seq} b`))];
export const UTF8_OK = 'ascii, çalışma, 日本, \u{1f600}';
