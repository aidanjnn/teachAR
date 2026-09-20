using System;
using System.Numerics;

namespace Trail.Runtime.Shell
{
    // Pure world-space touch interaction. No clocks, timers, device APIs, callbacks or I/O.
    // One confirm model for every Trail panel: touch a label, hold it, then withdraw.
    // Capture used touch/hold/withdraw while guide and storage fired on dwell alone; three
    // panels with two contradictory rules is the inconsistency U1 exists to remove.
    public enum ShellTouch { Idle, Touching, Armed }

    public sealed class ShellButton
    {
        public string Id { get; }
        public Vector3 PositionM { get; }
        public bool Enabled { get; }
        public ShellButton(string id, Vector3 positionM, bool enabled)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > 64) throw new ArgumentException("Button ID required.");
            if (!Finite(positionM.X) || !Finite(positionM.Y) || !Finite(positionM.Z)) throw new ArgumentException("Button position must be finite.");
            Id = id; PositionM = positionM; Enabled = enabled;
        }
        internal static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }

    public sealed class ShellTouchSample
    {
        public double SampleTimeMs { get; }
        public long Sequence { get; }
        public int OriginRevision { get; }
        public string TrackingSessionId { get; }
        public Vector3? LeftTipM { get; }
        public Vector3? RightTipM { get; }
        public ShellTouchSample(double sampleTimeMs, long sequence, int originRevision, string trackingSessionId,
            Vector3? leftTipM, Vector3? rightTipM)
        {
            SampleTimeMs = sampleTimeMs; Sequence = sequence; OriginRevision = originRevision;
            TrackingSessionId = trackingSessionId; LeftTipM = leftTipM; RightTipM = rightTipM;
        }
    }

    public sealed class ShellInteractionState
    {
        public ShellTouch Touch { get; internal set; } = ShellTouch.Idle;
        public int TouchingIndex { get; internal set; } = -1;
        // Set for exactly one reduction, on the withdrawal that confirms. Never latched.
        public int ConfirmedIndex { get; internal set; } = -1;
        public string ConfirmedId { get; internal set; }
        internal int TouchingHand = -1;
        internal string TouchingId;
        internal double StartedMs = -1, SampleMs = -1;
        internal long Sequence = -1;
        internal int OriginRevision = int.MinValue;
        internal string TrackingSessionId;
        internal ShellInteractionState Clone() => (ShellInteractionState)MemberwiseClone();
    }

    public static class ShellInteraction
    {
        // A tip within 2.5 cm of a label counts as touching it; labels are laid out further
        // apart than that so one tip can never satisfy two. Tuned values need a real headset.
        public const double HitRadiusM = .025, ArmMs = 600, StallMs = 100;

        public static ShellInteractionState Create() => new ShellInteractionState();

        /// <summary>
        /// Advances the interaction by one observation. Both hands are eligible so the panel
        /// works regardless of which hand is demonstrating. Any staleness, gap, reordering,
        /// origin change or tracking loss clears evidence rather than carrying it forward.
        /// </summary>
        public static ShellInteractionState Observe(ShellInteractionState previous, ShellButton[] buttons,
            ShellTouchSample sample, double nowMs)
        {
            if (previous == null || buttons == null) throw new ArgumentNullException();
            var s = previous.Clone();
            s.ConfirmedIndex = -1; s.ConfirmedId = null;

            // A caller clock that stalls, jumps backwards or outruns the sample cannot earn dwell.
            if (sample == null || !Finite(nowMs) || nowMs < 0 || !Finite(sample.SampleTimeMs) || sample.SampleTimeMs < 0 ||
                sample.Sequence < 0 || sample.SampleTimeMs > nowMs || nowMs - sample.SampleTimeMs > StallMs ||
                sample.SampleTimeMs <= s.SampleMs || sample.Sequence <= s.Sequence)
                return Clear(s);

            // Registration identity changes invalidate every pending touch; positions are workspace-relative.
            if (s.OriginRevision != int.MinValue && (sample.OriginRevision != s.OriginRevision ||
                !string.Equals(sample.TrackingSessionId, s.TrackingSessionId, StringComparison.Ordinal)))
            {
                Clear(s);
                s.OriginRevision = sample.OriginRevision; s.TrackingSessionId = sample.TrackingSessionId;
                s.SampleMs = sample.SampleTimeMs; s.Sequence = sample.Sequence;
                return s;
            }

            var gap = s.SampleMs < 0 ? 0 : sample.SampleTimeMs - s.SampleMs;
            s.OriginRevision = sample.OriginRevision; s.TrackingSessionId = sample.TrackingSessionId;
            s.SampleMs = sample.SampleTimeMs; s.Sequence = sample.Sequence;
            if (gap > StallMs) return Clear(s);

            // Evidence belongs to one button and one hand. A missing owner is not a withdrawal,
            // and another hand cannot inherit its dwell or keep its touch alive.
            if (s.TouchingIndex >= 0 && (s.TouchingIndex >= buttons.Length ||
                buttons[s.TouchingIndex] == null || !buttons[s.TouchingIndex].Enabled ||
                buttons[s.TouchingIndex].Id != s.TouchingId ||
                !Valid(s.TouchingHand == 0 ? sample.LeftTipM : sample.RightTipM))) return Clear(s);
            var selected = Nearest(buttons,
                s.TouchingHand == 1 ? null : sample.LeftTipM,
                s.TouchingHand == 0 ? null : sample.RightTipM, out var hand);
            if (selected != s.TouchingIndex)
            {
                // Only a fresh, tracked withdrawal from an armed label confirms. Sliding onto a
                // different label cancels instead, so a drifting hand cannot trigger a neighbour.
                var armed = s.Touch == ShellTouch.Armed && selected < 0 ? s.TouchingIndex : -1;
                Clear(s);
                if (selected >= 0) { s.TouchingIndex = selected; s.TouchingId = buttons[selected].Id; s.TouchingHand = hand; s.Touch = ShellTouch.Touching; s.StartedMs = sample.SampleTimeMs; }
                if (armed >= 0) { s.ConfirmedIndex = armed; s.ConfirmedId = buttons[armed].Id; }
                return s;
            }
            if (s.TouchingIndex >= 0 && s.Touch == ShellTouch.Touching && sample.SampleTimeMs - s.StartedMs >= ArmMs)
                s.Touch = ShellTouch.Armed;
            return s;
        }

        /// <summary>Cancels any pending touch. Call on pause, focus loss, teardown or a route change.</summary>
        public static ShellInteractionState Cancel(ShellInteractionState previous)
        {
            if (previous == null) throw new ArgumentNullException(nameof(previous));
            var s = previous.Clone(); s.ConfirmedIndex = -1; s.ConfirmedId = null; return Clear(s);
        }

        private static ShellInteractionState Clear(ShellInteractionState s)
        { s.Touch = ShellTouch.Idle; s.TouchingIndex = -1; s.TouchingId = null; s.TouchingHand = -1; s.StartedMs = -1; return s; }

        private static int Nearest(ShellButton[] buttons, Vector3? left, Vector3? right, out int hand)
        {
            hand = -1;
            var best = -1; var bestDistance = HitRadiusM;
            for (var i = 0; i < buttons.Length; i++)
            {
                var button = buttons[i];
                if (button == null || !button.Enabled) continue;
                for (var side = 0; side < 2; side++)
                {
                    var tip = side == 0 ? left : right;
                    if (!Valid(tip)) continue;
                    var point = tip.Value;
                    var distance = Vector3.Distance(point, button.PositionM);
                    if (distance <= bestDistance) { bestDistance = distance; best = i; hand = side; }
                }
            }
            return best;
        }

        private static bool Valid(Vector3? tip) => tip.HasValue && ShellButton.Finite(tip.Value.X) &&
            ShellButton.Finite(tip.Value.Y) && ShellButton.Finite(tip.Value.Z);

        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
