using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    public enum GuidePhase { Preload, Calibrate, Showing, WaitingStart, Guiding, Holding, TrackingLost, Paused, Complete }
    public enum GuideCompletionMode { PoseMatch, PathAndPose, UserConfirmed }
    public enum GuideHand { Left, Right }
    public enum GuideGesture { Any, Pinch, Open }
    public enum GuideSource { NativeHands, SyntheticDiagnostic }

    // Local execution values, not a second serialized tutorial format.
    public sealed class GuideGate
    {
        public Vector3 PositionM { get; }
        public double ToleranceM { get; }
        public double DwellMs { get; }
        public GuideGate(Vector3 positionM, double toleranceM = .06, double dwellMs = 100)
        {
            GuideValidation.Position(positionM);
            GuideValidation.Positive(toleranceM, 1, nameof(toleranceM));
            GuideValidation.Duration(dwellMs, nameof(dwellMs));
            PositionM = positionM; ToleranceM = toleranceM; DwellMs = dwellMs;
        }
    }

    public sealed class GuideTarget
    {
        public GuideHand Hand { get; }
        public CanonicalPose Start { get; }
        public CanonicalPose Checkpoint { get; }
        public double PositionToleranceM { get; }
        public double? OrientationToleranceRad { get; }
        public GuideGesture Gesture { get; }
        public ReadOnlyCollection<GuideGate> Gates { get; }
        public ReadOnlyCollection<Vector3> CuePath { get; }
        public GuideTarget(GuideHand hand, CanonicalPose start, CanonicalPose checkpoint,
            IEnumerable<GuideGate> gates = null, IEnumerable<Vector3> cuePath = null,
            double positionToleranceM = .05, double? orientationToleranceRad = null,
            GuideGesture gesture = GuideGesture.Any)
        {
            GuideValidation.Pose(start); GuideValidation.Pose(checkpoint);
            GuideValidation.Positive(positionToleranceM, 1, nameof(positionToleranceM));
            if (orientationToleranceRad.HasValue) GuideValidation.Positive(orientationToleranceRad.Value, Math.PI, nameof(orientationToleranceRad));
            if (!Enum.IsDefined(typeof(GuideHand), hand) || !Enum.IsDefined(typeof(GuideGesture), gesture)) throw new ArgumentException("Unknown hand/gesture.");
            Hand = hand; Start = start; Checkpoint = checkpoint; PositionToleranceM = positionToleranceM;
            OrientationToleranceRad = orientationToleranceRad; Gesture = gesture;
            var gateArray = (gates ?? Array.Empty<GuideGate>()).ToArray();
            if (gateArray.Length > 128 || gateArray.Any(g => g == null)) throw new ArgumentException("Invalid ordered gates.");
            Gates = Array.AsReadOnly(gateArray);
            var path = (cuePath ?? new[] { start.PositionM, checkpoint.PositionM }).ToArray();
            if (path.Length < 2 || path.Length > 3600) throw new ArgumentException("Cue path needs 2..3600 samples.");
            foreach (var p in path) GuideValidation.Position(p);
            CuePath = Array.AsReadOnly(path);
        }
    }

    public sealed class GuideStep
    {
        public string Id { get; }
        public string Instruction { get; }
        public GuideCompletionMode CompletionMode { get; }
        public ReadOnlyCollection<GuideTarget> Targets { get; }
        public double DwellMs { get; }
        public double StartDwellMs { get; }
        public bool RequiresExplicitStart { get; }
        public GuideStep(string id, string instruction, IEnumerable<GuideTarget> targets,
            GuideCompletionMode completionMode = GuideCompletionMode.PoseMatch,
            double dwellMs = 500, double startDwellMs = 200, bool requiresExplicitStart = false)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > 128) throw new ArgumentException("Step ID required.");
            if (!Enum.IsDefined(typeof(GuideCompletionMode), completionMode)) throw new ArgumentException("Unknown completion mode.");
            GuideValidation.Duration(dwellMs, nameof(dwellMs));
            GuideValidation.Duration(startDwellMs, nameof(startDwellMs));
            var array = targets?.ToArray() ?? throw new ArgumentNullException(nameof(targets));
            if (array.Length < 1 || array.Length > 2 || array.Any(t => t == null) || array.Select(t => t.Hand).Distinct().Count() != array.Length)
                throw new ArgumentException("One or two unique active hands required.");
            if (completionMode == GuideCompletionMode.PathAndPose && array.Any(t => t.Gates.Count == 0)) throw new ArgumentException("Path mode needs gates.");
            Id = id; Instruction = instruction ?? ""; Targets = Array.AsReadOnly(array); CompletionMode = completionMode;
            DwellMs = dwellMs; StartDwellMs = startDwellMs;
            // Overlapping regions cannot arm an automatic start. This is a visible local action.
            RequiresExplicitStart = requiresExplicitStart || array.All(t => Vector3.Distance(t.Start.PositionM, t.Checkpoint.PositionM) <= .07 + t.PositionToleranceM);
        }
    }

    public sealed class GuideDefinition
    {
        public string TutorialId { get; }
        public int TutorialRevision { get; }
        public GuideSource Source { get; }
        public ReadOnlyCollection<GuideStep> Steps { get; }
        public GuideDefinition(string tutorialId, int tutorialRevision, IEnumerable<GuideStep> steps, GuideSource source = GuideSource.NativeHands)
        {
            if (string.IsNullOrWhiteSpace(tutorialId) || tutorialRevision < 0) throw new ArgumentException("Tutorial identity required.");
            var array = steps?.ToArray() ?? throw new ArgumentNullException(nameof(steps));
            if (array.Length == 0 || array.Length > 128 || array.Any(s => s == null) || array.Select(s => s.Id).Distinct().Count() != array.Length)
                throw new ArgumentException("Unique bounded steps required.");
            if (!Enum.IsDefined(typeof(GuideSource), source)) throw new ArgumentException("Unknown source.");
            TutorialId = tutorialId; TutorialRevision = tutorialRevision; Source = source; Steps = Array.AsReadOnly(array);
        }
    }

    internal static class GuideValidation
    {
        internal static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        internal static void Positive(double value, double maximum, string name)
        { if (!Finite(value) || value <= 0 || value > maximum) throw new ArgumentOutOfRangeException(name); }
        internal static void Duration(double value, string name)
        { if (!Finite(value) || value < 0 || value > 10000) throw new ArgumentOutOfRangeException(name); }
        internal static void Position(Vector3 p)
        { if (!Finite(p.X) || !Finite(p.Y) || !Finite(p.Z)) throw new ArgumentException("Position must be finite."); }
        internal static void Pose(CanonicalPose p)
        { Position(p.PositionM); if (!Finite(p.OrientationXyzw.Length()) || Math.Abs(p.OrientationXyzw.Length() - 1) > .0001) throw new ArgumentException("Invalid orientation."); }
        internal static bool ValidPose(CanonicalPose? p)
        { if (!p.HasValue) return false; try { Pose(p.Value); return true; } catch (ArgumentException) { return false; } }
    }
}
