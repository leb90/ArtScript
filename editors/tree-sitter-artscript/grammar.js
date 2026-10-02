/// <reference types="tree-sitter-cli/dsl" />
// Tree-sitter grammar for ArtScript (.art). It mirrors src/parser.ts: declarations, members, the
// view (one element per line) and JavaScript-like expressions.

// Elements without positional content (`row wrap { }`): what follows the tag is a prop or a flag.
// Kept in sync with src/elements.ts by tests/treesitter.test.ts.
const NO_CONTENT = ["spinner", "divider", "row", "column", "grid", "card", "form", "list", "table", "tr", "meta"];

const PREC = {
  assign: 1, arrow: 1, ternary: 2, nullish: 3, or: 4, and: 5, equality: 6, compare: 7, add: 8, mul: 9, exp: 10,
  unary: 11, postfix: 12, call: 13,
};

const propertyName = ($) => alias($.identifier, $.property_identifier);
const typeName = ($) => alias($.identifier, $.type_identifier);
const commaSep = (rule) => optional(seq(rule, repeat(seq(",", rule)), optional(",")));

module.exports = grammar({
  name: "artscript",

  word: ($) => $.identifier,

  extras: ($) => [/\s/, $.comment],

  // `_end` closes a line: a line break (unless the next line continues the expression), or nothing
  // at all right before `}` and at the end of the file. See src/scanner.c.
  externals: ($) => [$._end, $.template_chars, $.css, $._error_sentinel],

  supertypes: ($) => [$._declaration, $._member, $._view_node],

  conflicts: ($) => [
    [$._primary, $.arrow_parameter],
    [$.object, $.block],
    [$.object, $.children],
  ],

  rules: {
    source_file: ($) => repeat($._declaration),

    _terminator: ($) => choice($._end, ";"),

    // ---------- declarations ----------
    _declaration: ($) => choice($.model, $.api, $.auth, $.use, $.server_function, $.server_job, $.component, $.page, $.layout, $.test),

    model: ($) => seq("model", field("name", typeName($)), "{", repeat($.field), "}"),
    field: ($) => seq(
      field("name", propertyName($)), ":", field("type", $.type),
      optional(seq("=", field("default", $._value))),
      repeat($.rule),
      $._terminator,
    ),
    rule: ($) => seq(field("name", $.identifier), optional(seq("=", field("value", choice($.number, $.string, seq("-", $.number)))))),

    type: ($) => seq(
      field("name", typeName($)),
      optional(seq("(", commaSep($.type), ")")),
      optional(seq("[", "]")),
      optional("?"),
    ),

    api: ($) => seq("api", field("name", $.identifier), ":", field("model", typeName($)), optional(field("access", choice("login", "private", "admin"))), $._terminator),
    auth: ($) => seq("auth", field("api", $.identifier), optional(seq("with", $.identifier, repeat(seq(",", $.identifier)))), $._terminator),

    use: ($) => seq(
      "use", field("source", $.string),
      choice(
        seq("as", field("default", $.identifier)),
        seq(optional(seq("as", field("default", $.identifier))), "{", commaSep($.import_name), "}"),
      ),
      $._terminator,
    ),
    import_name: ($) => seq(field("name", $.identifier), optional(seq("as", field("alias", $.identifier)))),

    server_function: ($) => seq("server", "fn", field("name", $.identifier), $.parameters, field("body", $.block)),
    server_job: ($) => seq("server", "job", field("name", $.identifier), "every", field("every", $.string), field("body", $.block)),

    parameters: ($) => seq("(", commaSep($.parameter), ")"),
    parameter: ($) => seq(field("name", $.identifier), optional(seq(":", field("type", $.type))), optional(seq("=", field("default", $._expression)))),

    component: ($) => seq("component", field("name", typeName($)), optional($.parameters), $.body),
    page: ($) => seq(
      "page", field("name", typeName($)), optional(field("path", $.string)),
      optional(seq("layout", field("layout", typeName($)))),
      optional(seq("requires", field("requires", choice("login", "admin")))),
      $.body,
    ),
    layout: ($) => seq("layout", field("name", typeName($)), optional(seq("layout", field("layout", typeName($)))), $.body),
    body: ($) => seq("{", repeat(choice($._member, $._view_node)), "}"),

    test: ($) => seq("test", field("description", $.string), "{", repeat($.step), "}"),
    step: ($) => seq(
      field("name", $.identifier),
      choice(seq("(", commaSep(choice($.string, $.number)), ")"), repeat(choice($.string, $.number))),
      $._terminator,
    ),

    // ---------- members ----------
    _member: ($) => choice($.state, $.computed, $.data, $.function, $.ref, $.mount, $.effect, $.style),

    state: ($) => seq("state", field("name", $.identifier), optional(seq(":", field("type", $.type))), "=", field("value", $._expression), $._terminator),
    computed: ($) => seq("computed", field("name", $.identifier), "=", field("value", $._expression), $._terminator),
    data: ($) => seq("data", field("name", $.identifier), "=", field("value", $._expression), optional("live"), $._terminator),
    function: ($) => seq("fn", field("name", $.identifier), $.parameters, field("body", $.block)),
    ref: ($) => seq("ref", field("name", $.identifier), $._terminator),
    mount: ($) => seq("mount", field("body", $.block)),
    effect: ($) => seq("effect", field("body", $.block)),
    style: ($) => seq("style", "{", optional($.css), "}"),

    // ---------- view ----------
    _view_node: ($) => choice($.if_view, $.for_view, $.element),

    if_view: ($) => prec.right(seq(
      "if", field("condition", $._expression), field("then", $.children),
      optional(seq("else", field("else", choice($.if_view, $.children)))),
    )),
    for_view: ($) => seq(
      "for", field("item", $.identifier), optional(seq(",", field("index", $.identifier))), "in", field("list", $._expression),
      optional(seq("key", field("key", $._expression))),
      field("body", $.children),
    ),

    // `tag content prop=value flag -> action { children }`
    element: ($) => seq(
      choice(
        seq(field("tag", alias($.identifier, $.tag)), optional(field("content", $._value))),
        field("tag", alias(choice(...NO_CONTENT), $.tag)),
        field("tag", $.component_name),
      ),
      repeat($.prop),
      optional(seq($.action, repeat($.prop))),
      choice($.children, $._terminator),
    ),
    component_name: (_) => token(prec(1, /[A-Z][A-Za-z0-9_$]*/)),
    // `name=value`, a flag (`primary`), `on:click=...` and `md:cols=3`.
    // Right after the tag, a bare name is the element's content (`text count`), not a flag.
    prop: ($) => choice(
      prec(-1, field("name", propertyName($))),
      seq(field("name", seq(propertyName($), optional(seq(token.immediate(":"), propertyName($))))), "=", field("value", $._value)),
    ),
    action: ($) => seq("->", choice($.block, $.let_statement, $.return_statement, $.expression_statement, $.if_statement)),
    children: ($) => prec.dynamic(1, seq("{", repeat($._view_node), "}")),

    // ---------- statements ----------
    block: ($) => prec.dynamic(1, seq("{", repeat($._statement), "}")),

    _statement: ($) => choice(
      seq(choice($.let_statement, $.return_statement, $.expression_statement), $._terminator),
      $.if_statement,
      $.for_statement,
      $.loop_statement,
      $.try_statement,
      $.cleanup_statement,
    ),
    let_statement: ($) => seq(choice("let", "const"), field("name", $.identifier), "=", field("value", $._expression)),
    return_statement: ($) => prec.right(seq("return", optional($._expression))),
    expression_statement: ($) => $._expression,
    if_statement: ($) => prec.right(seq(
      "if", field("condition", $._expression), field("then", choice($.block, $._statement)),
      optional(seq("else", field("else", choice($.if_statement, $.block)))),
    )),
    for_statement: ($) => seq(
      "for", field("item", $.identifier), optional(seq(",", field("index", $.identifier))), "in", field("list", $._expression), field("body", $.block),
    ),
    loop_statement: ($) => seq(
      "for", "(", "let", field("name", $.identifier), "=", field("start", $._expression), ";",
      field("condition", $._expression), ";", field("update", $._expression), ")", field("body", $.block),
    ),
    try_statement: ($) => seq(
      "try", field("body", $.block),
      "catch", optional(choice(seq("(", field("error", $.identifier), ")"), field("error", $.identifier))),
      field("handler", $.block),
    ),
    cleanup_statement: ($) => seq("cleanup", field("body", $.block)),

    // ---------- expressions ----------
    _expression: ($) => choice($._value, $.assignment, $.arrow_function),

    // Everything but an assignment or a bare arrow function: an element's content, a prop's value.
    _value: ($) => choice($._primary, $.unary, $.update, $.binary, $.ternary),

    _primary: ($) => choice(
      $.identifier, $.number, $.string, $.template, $.true, $.false, $.null,
      $.parenthesized, $.array, $.object, $.member, $.index, $.call,
    ),

    assignment: ($) => prec.right(PREC.assign, seq(
      field("left", $._value), field("operator", choice("=", "+=", "-=", "*=", "/=", "%=", "**=", "??=")), field("right", $._expression),
    )),

    arrow_function: ($) => prec.right(PREC.arrow, seq(
      choice(field("parameter", $.identifier), seq("(", commaSep($.arrow_parameter), ")")),
      "=>",
      field("body", choice($.block, $._expression)),
    )),
    arrow_parameter: ($) => seq(field("name", $.identifier), optional(seq(":", field("type", $.type)))),

    ternary: ($) => prec.right(PREC.ternary, seq(
      field("condition", $._value), "?", field("then", $._expression), ":", field("else", $._expression),
    )),

    binary: ($) => {
      const table = [
        ["??", PREC.nullish], ["||", PREC.or], ["&&", PREC.and],
        ["==", PREC.equality], ["!=", PREC.equality], ["===", PREC.equality], ["!==", PREC.equality],
        ["<", PREC.compare], [">", PREC.compare], ["<=", PREC.compare], [">=", PREC.compare],
        ["+", PREC.add], ["-", PREC.add], ["*", PREC.mul], ["/", PREC.mul], ["%", PREC.mul],
      ];
      return choice(
        ...table.map(([op, p]) => prec.left(p, seq(field("left", $._value), field("operator", op), field("right", $._value)))),
        prec.right(PREC.exp, seq(field("left", $._value), field("operator", "**"), field("right", $._value))),
      );
    },

    unary: ($) => prec(PREC.unary, seq(field("operator", choice("!", "-", "+", "typeof", "await", "new")), field("argument", $._value))),
    update: ($) => choice(
      prec(PREC.unary, seq(field("operator", choice("++", "--")), field("argument", $._value))),
      prec(PREC.postfix, seq(field("argument", $._value), field("operator", choice("++", "--")))),
    ),

    member: ($) => prec(PREC.call, seq(field("object", $._value), choice(".", "?."), field("property", propertyName($)))),
    index: ($) => prec(PREC.call, seq(field("object", $._value), optional("?."), "[", field("index", $._expression), "]")),
    call: ($) => prec(PREC.call, seq(field("function", $._value), optional("?."), field("arguments", $.arguments))),
    arguments: ($) => seq("(", commaSep(choice($._expression, $.spread)), ")"),
    spread: ($) => seq("...", $._expression),

    parenthesized: ($) => seq("(", $._expression, ")"),
    array: ($) => seq("[", commaSep(choice($._expression, $.spread)), "]"),
    object: ($) => seq("{", commaSep(choice($.pair, $.shorthand_property, $.spread)), "}"),
    pair: ($) => seq(field("key", choice(propertyName($), $.string)), ":", field("value", $._expression)),
    shorthand_property: ($) => $.identifier,

    template: ($) => seq("`", repeat(choice($.template_chars, $.escape_sequence, $.substitution)), "`"),
    substitution: ($) => seq("${", $._expression, "}"),

    string: ($) => choice(
      seq('"', repeat(choice(alias(token.immediate(prec(1, /[^"\\\n]+/)), $.string_content), $.escape_sequence)), '"'),
      seq("'", repeat(choice(alias(token.immediate(prec(1, /[^'\\\n]+/)), $.string_content), $.escape_sequence)), "'"),
    ),
    escape_sequence: (_) => token.immediate(/\\./),

    number: (_) => /0x[0-9a-fA-F_]+|[0-9][0-9_]*(\.[0-9_]+)?(e[+-]?[0-9]+)?|\.[0-9][0-9_]*(e[+-]?[0-9]+)?/,
    true: (_) => "true",
    false: (_) => "false",
    null: (_) => choice("null", "undefined"),

    identifier: (_) => /[A-Za-z_$][A-Za-z0-9_$]*/,

    comment: (_) => token(choice(seq("//", /[^\n]*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"))),
  },
});
