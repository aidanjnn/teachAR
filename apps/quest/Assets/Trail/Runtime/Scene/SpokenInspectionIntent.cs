using System;
using System.Text;

namespace Trail.Runtime.Scene
{
    /// <summary>Explicit English command phrases only. Live supplies transcript fragments, not completed turns.</summary>
    public static class SpokenInspectionIntent
    {
        public static bool IsCheck(string transcript)
        {
            var text = Normalize(transcript);
            return text == "check placement" || text == "check my placement" || text == "check this placement" ||
                text == "am i doing this right" || text == "does this look right" || text == "check again";
        }
        public static bool IsCancel(string transcript) => Normalize(transcript) == "cancel inspection";
        private static string Normalize(string text)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length > 500) return string.Empty;
            text = text.Trim().TrimEnd('?', '.', '!', ' ');
            var boundary = Math.Max(text.LastIndexOf('?'), Math.Max(text.LastIndexOf('.'), text.LastIndexOf('!')));
            if (boundary >= 0) text = text.Substring(boundary + 1).Trim();
            var normalized = new StringBuilder();
            foreach (var c in text.ToLowerInvariant())
            {
                if (char.IsLetter(c)) normalized.Append(c);
                else if (char.IsWhiteSpace(c) && normalized.Length > 0 && normalized[normalized.Length - 1] != ' ') normalized.Append(' ');
                else if (c != '?' && c != '.' && c != '!' && c != ',') return string.Empty;
            }
            return normalized.ToString().Trim();
        }
    }
}
