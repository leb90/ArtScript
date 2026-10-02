; Declarations and members
[
  "model" "api" "auth" "use" "server" "fn" "job" "component" "page" "layout" "test"
  "state" "computed" "data" "ref" "mount" "effect" "style" "cleanup"
  "let" "const"
] @keyword

["if" "else" "for" "in" "key" "return" "try" "catch"] @keyword.control
["as" "with" "every" "requires" "live"] @keyword.modifier
["typeof" "await" "new"] @keyword.operator

(api access: _ @keyword.modifier)
(page requires: _ @keyword.modifier)

(type_identifier) @type

(field name: (property_identifier) @property.definition)
(rule name: (identifier) @attribute)

(function name: (identifier) @function)
(server_function name: (identifier) @function)
(server_job name: (identifier) @function)
(parameter name: (identifier) @variable.parameter)
(arrow_parameter name: (identifier) @variable.parameter)
(arrow_function parameter: (identifier) @variable.parameter)
(step name: (identifier) @function.builtin)

(state name: (identifier) @variable.member)
(computed name: (identifier) @variable.member)
(data name: (identifier) @variable.member)
(ref name: (identifier) @variable.member)

; View
(tag) @tag
(component_name) @type
(prop name: (property_identifier) @attribute)
(for_view item: (identifier) @variable.parameter)
(for_statement item: (identifier) @variable.parameter)
(for_statement index: (identifier) @variable.parameter)
(for_view index: (identifier) @variable.parameter)

; Expressions
(member property: (property_identifier) @property)
(pair key: (property_identifier) @property)
(call function: (identifier) @function.call)
(call function: (member property: (property_identifier) @function.method))

(number) @number
(string) @string
(template) @string
(escape_sequence) @string.escape
(substitution ["${" "}"] @punctuation.special)
[(true) (false)] @boolean
(null) @constant.builtin
(comment) @comment

"->" @operator
[
  "=" "+=" "-=" "*=" "/=" "%=" "**=" "??=" "=>" "==" "!=" "===" "!==" "<" ">" "<=" ">="
  "+" "-" "*" "/" "%" "**" "&&" "||" "??" "!" "?" ":" "++" "--" "..."
] @operator
["." "?." "," ";"] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
