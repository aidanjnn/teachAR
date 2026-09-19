using System;

namespace Trail.Runtime.Scene
{
    // Pure lifecycle seam: caller supplies monotonic milliseconds and actual sensor delivery IDs.
    public sealed class FreshFrameGate
    {
        public string SourceSessionId { get; private set; } = Guid.NewGuid().ToString();
        public long SourceFrameSequence { get; private set; }
        public long Generation { get; private set; }
        public bool Pending => nonce != null;
        private string nonce;
        private long baselineSequence;
        private long sensorTicks;
        private double requestedAt;
        private double deliveredAt;
        private double lastNow = -1;
        private bool copying;

        public void Begin(string captureNonce, double nowMs)
        {
            CheckTime(nowMs);
            if (string.IsNullOrWhiteSpace(captureNonce) || captureNonce.Length > 128) throw new ArgumentException("Invalid nonce");
            if (Pending || copying) throw new InvalidOperationException("Camera busy");
            nonce = captureNonce; baselineSequence = SourceFrameSequence; requestedAt = nowMs;
        }
        public bool Delivered(long timestampTicks, double nowMs)
        {
            CheckTime(nowMs);
            if (timestampTicks <= sensorTicks || timestampTicks <= 0) return false;
            sensorTicks = timestampTicks; SourceFrameSequence++; deliveredAt = nowMs;
            return true;
        }
        public FrameTicket TryCopy(double nowMs)
        {
            CheckTime(nowMs);
            if (!Pending || copying) return null;
            if (nowMs - requestedAt > 2000) { Invalidate(); return null; }
            if (SourceFrameSequence <= baselineSequence || deliveredAt <= requestedAt) return null;
            copying = true;
            return new FrameTicket(nonce, SourceSessionId, SourceFrameSequence, sensorTicks, deliveredAt, Generation);
        }
        public bool Complete(FrameTicket ticket, double nowMs)
        {
            CheckTime(nowMs);
            if (ticket == null) return false;
            copying = false;
            bool current = Pending && ticket.Generation == Generation && ticket.Nonce == nonce &&
                ticket.SourceSessionId == SourceSessionId && nowMs - ticket.DeliveredAtMs <= 500 && nowMs - requestedAt <= 2000;
            nonce = null;
            return current;
        }
        public void Invalidate()
        {
            Generation++; nonce = null;
            // A queued GPU readback retains its slot until Complete/ReleaseCopy to bound native allocations.
        }
        public void ReleaseCopy() { copying = false; }
        public void Restart()
        {
            Invalidate(); SourceSessionId = Guid.NewGuid().ToString(); SourceFrameSequence = 0; sensorTicks = 0;
        }
        private void CheckTime(double now)
        {
            if (double.IsNaN(now) || double.IsInfinity(now) || now < 0 || now < lastNow) throw new ArgumentException("Invalid monotonic time");
            lastNow = now;
        }
    }
    public sealed class FrameTicket
    {
        public readonly string Nonce, SourceSessionId;
        public readonly long SourceFrameSequence, SensorTimestampTicks, Generation;
        public readonly double DeliveredAtMs;
        public FrameTicket(string nonce, string session, long sequence, long ticks, double deliveredAt, long generation)
        { Nonce = nonce; SourceSessionId = session; SourceFrameSequence = sequence; SensorTimestampTicks = ticks; DeliveredAtMs = deliveredAt; Generation = generation; }
    }
}
