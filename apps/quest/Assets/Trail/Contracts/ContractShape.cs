using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Trail.Contracts
{
    // This validates only the JSON Schema subset emitted by the pinned Zod generator.
    // Refinements are implemented separately and checked by a shared cross-language corpus.
    internal static class ContractShape
    {
        internal static void Validate(string name, object value) => Check((Dictionary<string, object>)ContractShapeData.Schemas[name], value, "$", 0);
        private static void Fail(string path, string message) { throw new ContractException(path + ": " + message); }
        private static void Check(Dictionary<string, object> s, object value, string path, int depth)
        {
            if (depth > 64) Fail(path, "Schema nesting limit");
            object keyword;
            if (s.TryGetValue("$ref", out keyword)) { Check((Dictionary<string, object>)ContractShapeData.Schemas[(string)keyword], value, path, depth + 1); return; }
            if (s.TryGetValue("anyOf", out keyword) || s.TryGetValue("oneOf", out keyword))
            {
                int matches = 0;
                foreach (var option in (List<object>)keyword)
                {
                    try { Check((Dictionary<string, object>)option, value, path, depth + 1); matches++; }
                    catch (ContractException) { }
                }
                if (matches == 0 || (s.ContainsKey("oneOf") && matches != 1)) Fail(path, "Invalid union");
                return;
            }
            if (s.TryGetValue("const", out keyword) && !Equals(value, keyword)) Fail(path, "Unexpected constant/version");
            if (s.TryGetValue("enum", out keyword) && !((List<object>)keyword).Contains(value)) Fail(path, "Unknown enum");
            if (!s.TryGetValue("type", out keyword)) Fail(path, "Unsupported generated schema");
            switch ((string)keyword)
            {
                case "null": if (value != null) Fail(path, "Expected null"); return;
                case "boolean": if (!(value is bool)) Fail(path, "Expected boolean"); return;
                case "number": case "integer":
                    if (!(value is double)) Fail(path, "Expected number");
                    double n = (double)value;
                    if (double.IsNaN(n) || double.IsInfinity(n) || ((string)keyword == "integer" && Math.Truncate(n) != n)) Fail(path, "Expected finite number/integer");
                    if (s.TryGetValue("minimum", out keyword) && n < (double)keyword || s.TryGetValue("maximum", out keyword) && n > (double)keyword || s.TryGetValue("exclusiveMinimum", out keyword) && n <= (double)keyword || s.TryGetValue("exclusiveMaximum", out keyword) && n >= (double)keyword) Fail(path, "Number outside bounds");
                    return;
                case "string":
                    if (!(value is string)) Fail(path, "Expected string");
                    string text = (string)value;
                    if (s.TryGetValue("minLength", out keyword) && text.Length < (double)keyword || s.TryGetValue("maxLength", out keyword) && text.Length > (double)keyword) Fail(path, "String length outside bounds");
                    if (s.TryGetValue("pattern", out keyword) && !Regex.IsMatch(text, (string)keyword, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))) Fail(path, "Invalid string pattern");
                    return;
                case "array":
                    var array = value as List<object>; if (array == null) Fail(path, "Expected array");
                    if (s.TryGetValue("minItems", out keyword) && array.Count < (double)keyword || s.TryGetValue("maxItems", out keyword) && array.Count > (double)keyword) Fail(path, "Array length outside bounds");
                    if (s.TryGetValue("prefixItems", out keyword)) { var items = (List<object>)keyword; for (int i = 0; i < array.Count; i++) Check((Dictionary<string, object>)items[i], array[i], path + "[" + i + "]", depth + 1); }
                    else if (s.TryGetValue("items", out keyword)) for (int i = 0; i < array.Count; i++) Check((Dictionary<string, object>)keyword, array[i], path + "[" + i + "]", depth + 1);
                    return;
                case "object":
                    var map = value as Dictionary<string, object>; if (map == null) Fail(path, "Expected object");
                    if (s.TryGetValue("required", out keyword)) foreach (string key in (List<object>)keyword) if (!map.ContainsKey(key)) Fail(path, "Missing property " + key);
                    var properties = s.TryGetValue("properties", out keyword) ? (Dictionary<string, object>)keyword : new Dictionary<string, object>();
                    foreach (var pair in map)
                    {
                        if (s.TryGetValue("propertyNames", out keyword)) Check((Dictionary<string, object>)keyword, pair.Key, path, depth + 1);
                        if (properties.TryGetValue(pair.Key, out keyword)) Check((Dictionary<string, object>)keyword, pair.Value, path + "." + pair.Key, depth + 1);
                        else if (s.TryGetValue("additionalProperties", out keyword) && keyword is Dictionary<string, object>) Check((Dictionary<string, object>)keyword, pair.Value, path + "." + pair.Key, depth + 1);
                        else Fail(path, "Unknown property " + pair.Key);
                    }
                    return;
                default: Fail(path, "Unsupported schema type"); return;
            }
        }
    }
}
