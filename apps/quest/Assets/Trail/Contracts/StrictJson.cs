using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Trail.Contracts
{
    public sealed class ContractException : ArgumentException
    {
        public ContractException(string message) : base(message) { }
    }

    // Deliberately small JSON grammar: no reflection, dynamic code, engine, or serializer dependency.
    // Reject duplicate keys before creating DTOs; parsers that keep the last value cannot do this.
    internal sealed class StrictJson
    {
        internal const int MaxChars = 32 * 1024 * 1024;
        private readonly string text;
        private int cursor;
        private int nodes;
        private StrictJson(string value) { text = value; }
        internal static object Parse(string text)
        {
            if (text == null || text.Length > MaxChars) throw new ContractException("JSON input is null or too large");
            var parser = new StrictJson(text);
            var result = parser.Value(0);
            parser.Space();
            if (parser.cursor != text.Length) throw new ContractException("Trailing JSON input");
            return result;
        }
        private void Space() { while (cursor < text.Length && (text[cursor] == ' ' || text[cursor] == '\r' || text[cursor] == '\n' || text[cursor] == '\t')) cursor++; }
        private bool Take(char c) { Space(); if (cursor < text.Length && text[cursor] == c) { cursor++; return true; } return false; }
        private void Expect(char c) { if (!Take(c)) throw new ContractException("Expected JSON token " + c); }
        private object Value(int depth)
        {
            if (depth > 64 || ++nodes > 2000000) throw new ContractException("JSON nesting/node limit");
            Space();
            if (cursor == text.Length) throw new ContractException("Unexpected end of JSON");
            char c = text[cursor];
            if (c == '"') return String();
            if (Take('{'))
            {
                var map = new Dictionary<string, object>(StringComparer.Ordinal);
                if (Take('}')) return map;
                do { Space(); var key = String(); Expect(':'); if (map.ContainsKey(key)) throw new ContractException("Duplicate JSON property: " + key); map.Add(key, Value(depth + 1)); } while (Take(','));
                Expect('}'); return map;
            }
            if (Take('['))
            {
                var list = new List<object>();
                if (Take(']')) return list;
                do { list.Add(Value(depth + 1)); } while (Take(','));
                Expect(']'); return list;
            }
            foreach (string literal in new[] { "true", "false", "null" })
                if (cursor + literal.Length <= text.Length && string.CompareOrdinal(text, cursor, literal, 0, literal.Length) == 0)
                { cursor += literal.Length; return literal == "null" ? null : (object)(literal == "true"); }
            int start = cursor;
            if (cursor < text.Length && text[cursor] == '-') cursor++;
            if (cursor < text.Length && text[cursor] == '0') cursor++;
            else { int digits = cursor; while (cursor < text.Length && Digit(text[cursor])) cursor++; if (digits == cursor) throw new ContractException("Invalid JSON number"); }
            if (cursor < text.Length && text[cursor] == '.') { cursor++; int digits = cursor; while (cursor < text.Length && Digit(text[cursor])) cursor++; if (digits == cursor) throw new ContractException("Invalid fraction"); }
            if (cursor < text.Length && (text[cursor] == 'e' || text[cursor] == 'E')) { cursor++; if (cursor < text.Length && (text[cursor] == '+' || text[cursor] == '-')) cursor++; int digits = cursor; while (cursor < text.Length && Digit(text[cursor])) cursor++; if (digits == cursor) throw new ContractException("Invalid exponent"); }
            double number;
            if (!double.TryParse(text.Substring(start, cursor - start), NumberStyles.Float, CultureInfo.InvariantCulture, out number) || double.IsNaN(number) || double.IsInfinity(number)) throw new ContractException("Nonfinite/invalid JSON number");
            return number;
        }
        private static bool Digit(char c) => c >= '0' && c <= '9';
        private string String()
        {
            if (cursor >= text.Length || text[cursor++] != '"') throw new ContractException("Expected JSON string");
            var result = new StringBuilder();
            while (cursor < text.Length)
            {
                char c = text[cursor++];
                if (c == '"') return result.ToString();
                if (c < 32) throw new ContractException("Control character in string");
                if (c != '\\') { result.Append(c); continue; }
                if (cursor == text.Length) throw new ContractException("Incomplete escape");
                c = text[cursor++];
                switch (c)
                {
                    case '"': case '\\': case '/': result.Append(c); break;
                    case 'b': result.Append('\b'); break; case 'f': result.Append('\f'); break;
                    case 'n': result.Append('\n'); break; case 'r': result.Append('\r'); break; case 't': result.Append('\t'); break;
                    case 'u':
                        if (cursor + 4 > text.Length) throw new ContractException("Incomplete Unicode escape");
                        ushort code;
                        if (!ushort.TryParse(text.Substring(cursor, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out code)) throw new ContractException("Invalid Unicode escape");
                        cursor += 4; result.Append((char)code); break;
                    default: throw new ContractException("Invalid JSON escape");
                }
            }
            throw new ContractException("Unterminated JSON string");
        }
        internal static string Stringify(object value)
        {
            var buffer = new StringBuilder(); Write(value, buffer, 0);
            if (buffer.Length > MaxChars) throw new ContractException("JSON output too large");
            return buffer.ToString();
        }
        private static void Write(object value, StringBuilder b, int depth)
        {
            if (depth > 64 || b.Length > MaxChars) throw new ContractException("JSON output limit");
            if (value == null) { b.Append("null"); return; }
            if (value is string)
            {
                b.Append('"'); foreach (char c in (string)value)
                { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32 || char.IsSurrogate(c)) b.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture)); else b.Append(c); }
                b.Append('"'); return;
            }
            if (value is bool) { b.Append((bool)value ? "true" : "false"); return; }
            if (value is double || value is float || value is int || value is long)
            {
                double d = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                if (double.IsNaN(d) || double.IsInfinity(d)) throw new ContractException("Cannot encode nonfinite number");
                b.Append(d.ToString("R", CultureInfo.InvariantCulture)); return;
            }
            if (value is IDictionary<string, object>)
            {
                b.Append('{'); bool first = true; foreach (var pair in (IDictionary<string, object>)value)
                { if (!first) b.Append(','); first = false; Write(pair.Key, b, depth + 1); b.Append(':'); Write(pair.Value, b, depth + 1); } b.Append('}'); return;
            }
            if (value is IEnumerable)
            {
                b.Append('['); bool first = true; foreach (var item in (IEnumerable)value) { if (!first) b.Append(','); first = false; Write(item, b, depth + 1); } b.Append(']'); return;
            }
            throw new ContractException("Unsupported JSON value");
        }
    }
}
