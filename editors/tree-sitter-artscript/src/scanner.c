// External scanner for ArtScript: line endings that close a statement, the text of a template
// string, and the raw CSS of a `style { }` block.
#include "tree_sitter/parser.h"

enum TokenType { END, TEMPLATE_CHARS, CSS, ERROR_SENTINEL };

void *tree_sitter_artscript_external_scanner_create(void) { return NULL; }
void tree_sitter_artscript_external_scanner_destroy(void *payload) {}
unsigned tree_sitter_artscript_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_artscript_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static bool is_word(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '$';
}

// Whether the lexer is at `word` followed by a non-word character.
static bool at_keyword(TSLexer *lexer, const char *word) {
  for (; *word; word++) {
    if (lexer->lookahead != *word) return false;
    lexer->advance(lexer, false);
  }
  return !is_word(lexer->lookahead);
}

static bool scan_template_chars(TSLexer *lexer) {
  bool any = false;
  for (;;) {
    lexer->mark_end(lexer);
    switch (lexer->lookahead) {
      case '`': case '\\': case 0:
        return any;
      case '$':
        lexer->advance(lexer, false);
        if (lexer->lookahead == '{') return any;
        break;
      default:
        lexer->advance(lexer, false);
    }
    any = true;
  }
}

// Everything up to the `}` that closes the block.
static bool scan_css(TSLexer *lexer) {
  bool any = false;
  for (int depth = 0; !lexer->eof(lexer);) {
    if (lexer->lookahead == '{') depth++;
    else if (lexer->lookahead == '}' && depth-- == 0) break;
    lexer->advance(lexer, false);
    any = true;
  }
  lexer->mark_end(lexer);
  return any;
}

// A line ends at a line break, unless the next line starts with `?`, `:`, `.` (not `...`), `&&`,
// `||`, `else` or `catch`: then it continues this one. Before `}` and at the end of the file the
// line ends without a line break.
static bool scan_end(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r') lexer->advance(lexer, true);
  if (lexer->eof(lexer) || lexer->lookahead == '}') {
    lexer->mark_end(lexer);
    return true;
  }
  // A comment at the end of the line: the line break after it ends the line.
  if (lexer->lookahead == '/') {
    lexer->advance(lexer, true);
    if (lexer->lookahead != '/') return false;
    while (lexer->lookahead != '\n' && !lexer->eof(lexer)) lexer->advance(lexer, true);
  }
  if (lexer->lookahead != '\n') return false;
  lexer->advance(lexer, false);
  lexer->mark_end(lexer);
  for (;;) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r' || lexer->lookahead == '\n') lexer->advance(lexer, false);
    // Comment lines in between don't matter.
    if (lexer->lookahead != '/') break;
    lexer->advance(lexer, false);
    if (lexer->lookahead != '/') return true;
    while (lexer->lookahead != '\n' && !lexer->eof(lexer)) lexer->advance(lexer, false);
  }
  switch (lexer->lookahead) {
    case '?': case ':':
      return false;
    case '.':
      lexer->advance(lexer, false);
      if (lexer->lookahead != '.') return false;
      lexer->advance(lexer, false);
      return lexer->lookahead == '.';
    case '&':
      lexer->advance(lexer, false);
      return lexer->lookahead != '&';
    case '|':
      lexer->advance(lexer, false);
      return lexer->lookahead != '|';
    case 'e':
      return !at_keyword(lexer, "else");
    case 'c':
      return !at_keyword(lexer, "catch");
    case 'f':
      return !at_keyword(lexer, "finally");
    default:
      return true;
  }
}

bool tree_sitter_artscript_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[ERROR_SENTINEL]) return false;
  if (valid_symbols[TEMPLATE_CHARS]) {
    lexer->result_symbol = TEMPLATE_CHARS;
    return scan_template_chars(lexer);
  }
  if (valid_symbols[CSS]) {
    lexer->result_symbol = CSS;
    return scan_css(lexer);
  }
  if (valid_symbols[END]) {
    lexer->result_symbol = END;
    return scan_end(lexer);
  }
  return false;
}
