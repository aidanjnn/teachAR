using System;

namespace Trail.Runtime.Network
{
    /// <summary>Pure URL and credential boundary, also exercised outside Unity.</summary>
    public sealed class ConnectionPolicy
    {
        public Uri Origin { get; }
        public ConnectionPolicy(string origin, bool allowUsbLoopback)
        {
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || !string.IsNullOrEmpty(uri.UserInfo) ||
                !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/" ||
                !(uri.Scheme == "https" || (allowUsbLoopback && uri.Scheme == "http" &&
                    (uri.Host == "127.0.0.1" || uri.Host == "[::1]" || uri.Host == "localhost"))))
                throw new ArgumentException("Use an HTTPS origin, or explicitly enabled USB loopback development origin.");
            Origin = uri;
        }
        public Uri Endpoint(string path)
        {
            if (string.IsNullOrEmpty(path) || !path.StartsWith("/api/", StringComparison.Ordinal) ||
                path.Contains("\\") || path.Contains("?") || path.Contains("#") || path.Contains("%") ||
                path.Contains("..") || !Uri.TryCreate(Origin, path, out var uri) || uri.Authority != Origin.Authority)
                throw new ArgumentException("Expected a plain /api/ path without URL credentials or traversal.");
            return uri;
        }
    }

    public sealed class PairedSession
    {
        public string Token { get; private set; }
        public string Role { get; private set; }
        public string SessionId { get; private set; }
        public double ExpiresAt { get; private set; }
        public long Generation { get; private set; }
        public bool IsAvailable(double nowMs) => Token != null && nowMs < ExpiresAt;
        public void Accept(string token, string role, string sessionId, double expiresAt, double nowMs)
        {
            if (token == null || !System.Text.RegularExpressions.Regex.IsMatch(token, "^[A-Za-z0-9_-]{43}$") ||
                (role != "author" && role != "learner" && role != "spectator") || !Guid.TryParseExact(sessionId, "D", out _) ||
                double.IsNaN(expiresAt) || double.IsInfinity(expiresAt) || expiresAt <= nowMs || expiresAt > nowMs + 3_660_000)
                throw new ArgumentException("Invalid pairing response.");
            Clear(); Token = token; Role = role; SessionId = sessionId; ExpiresAt = expiresAt;
        }
        public void Clear() { Token = null; Role = null; SessionId = null; ExpiresAt = 0; Generation++; }
    }
}
