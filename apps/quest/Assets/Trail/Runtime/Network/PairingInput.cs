using System;

namespace Trail.Runtime.Network
{
    /// <summary>Bounded, memory-only setup input. Role comes from the server-issued code.</summary>
    public sealed class PairingInput
    {
        public string Origin { get; private set; } = "https://";
        public string Code { get; private set; } = "";
        public bool EditingCode { get; set; }
        public bool UsbLoopback { get; private set; }
        public void Append(char value)
        {
            if (EditingCode) { if (value >= '0' && value <= '9' && Code.Length < 8) Code += value; return; }
            const string allowed = "abcdefghijklmnopqrstuvwxyz0123456789.:/-_[]";
            if (allowed.IndexOf(value) >= 0 && Origin.Length < 128) Origin += value;
        }
        public void Backspace()
        {
            if (EditingCode) { if (Code.Length > 0) Code = Code.Substring(0, Code.Length - 1); }
            else if (Origin.Length > 0) Origin = Origin.Substring(0, Origin.Length - 1);
        }
        public void SelectHttps() { Origin = "https://"; UsbLoopback = false; EditingCode = false; }
        public void SelectUsb(bool developmentBuild)
        {
            if (!developmentBuild) throw new ArgumentException("USB loopback requires a development build");
            Origin = "http://127.0.0.1:3001"; UsbLoopback = true; EditingCode = true;
        }
        public string TakeCode(bool developmentBuild)
        {
            _ = new ConnectionPolicy(Origin, UsbLoopback && developmentBuild);
            if (Code.Length != 8) throw new ArgumentException("Enter all eight digits from the desktop role code");
            var result = Code; Code = ""; return result;
        }
        public void ClearCode() { Code = ""; }
    }
}
