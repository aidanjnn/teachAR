using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Trail.Runtime.Shell
{
    // Pure Create/Follow routing. No clocks, timers, device APIs, callbacks or I/O.
    // This decides WHAT the learner may do; the existing capture, guide and storage
    // controllers remain the only things that actually do it. Nothing here can
    // advance a guide step -- GuideReducer stays the sole progression authority.
    public enum ShellRoute { Home, Create, Follow, Library, Settings }

    public enum ShellCommand
    {
        OpenCreate, OpenFollow, OpenLibrary, OpenSettings, Back,
        SetSavePosition, ChangeSavePosition, StartRecording, StopRecording, DiscardTake,
        Calibrate, SampleMark, RecenterWorkspace,
        PreloadSelected, NextGuide, RefreshLibrary, UploadLastCapture,
        StartStep, Repeat, Pause, Resume, ConfirmStep,
        ToggleDiagnostics
    }

    /// <summary>
    /// Everything the shell needs to decide availability, supplied fresh by the adapter.
    /// Nothing is cached across frames: a stale answer here would offer a control that
    /// cannot work, which is exactly the confusion U1 is meant to remove.
    /// </summary>
    public sealed class ShellConditions
    {
        public bool Paired { get; }
        public bool IsAuthor { get; }
        public bool Calibrated { get; }
        public bool HandsTracked { get; }
        public bool SavePositionSet { get; }
        public bool IsRecording { get; }
        public bool HasLastTake { get; }
        public bool GuideLoaded { get; }
        public bool GuideAwaitingExplicitStart { get; }
        public bool GuideActive { get; }
        public bool GuidePaused { get; }
        public bool GuideUserConfirmed { get; }
        public bool LibraryHasEntries { get; }
        public ShellConditions(bool paired = false, bool isAuthor = false, bool calibrated = false,
            bool handsTracked = false, bool savePositionSet = false, bool isRecording = false,
            bool hasLastTake = false, bool guideLoaded = false, bool guideAwaitingExplicitStart = false,
            bool guideActive = false, bool guidePaused = false, bool guideUserConfirmed = false,
            bool libraryHasEntries = false)
        {
            Paired = paired; IsAuthor = isAuthor; Calibrated = calibrated; HandsTracked = handsTracked;
            SavePositionSet = savePositionSet; IsRecording = isRecording; HasLastTake = hasLastTake;
            GuideLoaded = guideLoaded; GuideAwaitingExplicitStart = guideAwaitingExplicitStart;
            GuideActive = guideActive; GuidePaused = guidePaused; GuideUserConfirmed = guideUserConfirmed;
            LibraryHasEntries = libraryHasEntries;
        }
    }

    public sealed class ShellEntry
    {
        public ShellCommand Command { get; }
        public string Label { get; }
        public bool Enabled { get; }
        public string Reason { get; }
        internal ShellEntry(ShellCommand command, string label, bool enabled, string reason)
        { Command = command; Label = label; Enabled = enabled; Reason = reason; }
    }

    public sealed class ShellView
    {
        public ShellRoute Route { get; }
        public string Title { get; }
        public string Notice { get; }
        public bool DiagnosticsVisible { get; }
        public ReadOnlyCollection<ShellEntry> Entries { get; }
        internal ShellView(ShellRoute route, string title, string notice, bool diagnosticsVisible, List<ShellEntry> entries)
        { Route = route; Title = title; Notice = notice; DiagnosticsVisible = diagnosticsVisible; Entries = entries.AsReadOnly(); }
    }

    public sealed class ShellState
    {
        public ShellRoute Route { get; internal set; } = ShellRoute.Home;
        // Engineering panels are off by default. A learner must never meet them by accident.
        public bool DiagnosticsVisible { get; internal set; }
        internal ShellState Clone() => (ShellState)MemberwiseClone();
    }

    public static class ShellModel
    {
        public static ShellState Create() => new ShellState();

        /// <summary>
        /// Applies a command that the interaction layer confirmed. Commands that are not
        /// enabled for the current route/conditions are ignored, so a stale confirmation
        /// arriving after conditions changed cannot act.
        /// </summary>
        public static ShellState Apply(ShellState previous, ShellCommand command, ShellConditions conditions)
        {
            if (previous == null || conditions == null) throw new ArgumentNullException();
            var s = previous.Clone();
            if (!Enabled(s, command, conditions)) return s;
            switch (command)
            {
                case ShellCommand.OpenCreate: s.Route = ShellRoute.Create; break;
                case ShellCommand.OpenFollow: s.Route = ShellRoute.Follow; break;
                case ShellCommand.OpenLibrary: s.Route = ShellRoute.Library; break;
                case ShellCommand.OpenSettings: s.Route = ShellRoute.Settings; break;
                // Leaving settings always hides diagnostics again; they are opt-in per visit.
                case ShellCommand.Back: s.Route = ShellRoute.Home; s.DiagnosticsVisible = false; break;
                case ShellCommand.ToggleDiagnostics: s.DiagnosticsVisible = !s.DiagnosticsVisible; break;
            }
            return s;
        }

        /// <summary>Builds the visible control set for the current route. Disabled entries keep their reason.</summary>
        public static ShellView Describe(ShellState state, ShellConditions c)
        {
            if (state == null || c == null) throw new ArgumentNullException();
            var entries = new List<ShellEntry>();
            void Add(ShellCommand command, string label) =>
                entries.Add(new ShellEntry(command, label, Enabled(state, command, c), Reason(state, command, c)));

            string title, notice;
            switch (state.Route)
            {
                case ShellRoute.Create:
                    title = "Create a tutorial";
                    notice = !c.SavePositionSet
                        ? "Rest both palms where every recording should start, then Set save position."
                        : c.IsRecording ? "Recording. Return both palms to the save position to finish."
                        : "Save position kept for this tutorial. Record the next action.";
                    Add(ShellCommand.SetSavePosition, "Set save position");
                    Add(ShellCommand.ChangeSavePosition, "Change save position");
                    Add(ShellCommand.StartRecording, "Record action");
                    Add(ShellCommand.StopRecording, "Stop recording");
                    Add(ShellCommand.DiscardTake, "Discard take");
                    Add(ShellCommand.UploadLastCapture, "Send for review");
                    Add(ShellCommand.Back, "Back");
                    break;
                case ShellRoute.Follow:
                    title = "Follow a tutorial";
                    notice = !c.GuideLoaded ? "Choose a guide in Library, then preload it."
                        : !c.Calibrated ? "Place the mat and calibrate before following."
                        : c.GuidePaused ? "Paused. Resume when you are ready."
                        : c.GuideActive ? "Your turn. Movement checkpoints only; this does not verify the assembly."
                        : "Watch the demonstration.";
                    Add(ShellCommand.StartStep, "Start");
                    Add(ShellCommand.Repeat, "Repeat");
                    Add(ShellCommand.Pause, "Pause");
                    Add(ShellCommand.Resume, "Resume");
                    Add(ShellCommand.ConfirmStep, "I completed this step");
                    Add(ShellCommand.Back, "Back");
                    break;
                case ShellRoute.Library:
                    title = "Library";
                    notice = c.LibraryHasEntries ? "Preload a guide to follow it on this headset."
                        : "No ready guides yet. Refresh after an expert review.";
                    Add(ShellCommand.NextGuide, "Next guide");
                    Add(ShellCommand.PreloadSelected, "Preload selected guide");
                    Add(ShellCommand.RefreshLibrary, "Refresh");
                    Add(ShellCommand.Back, "Back");
                    break;
                case ShellRoute.Settings:
                    title = "Settings";
                    notice = state.DiagnosticsVisible
                        ? "Engineering panels are visible. They are diagnostics, not the guided experience."
                        : "Workspace setup and diagnostics.";
                    Add(ShellCommand.Calibrate, "Calibrate workspace");
                    Add(ShellCommand.SampleMark, "Sample mark");
                    Add(ShellCommand.RecenterWorkspace, "Mat moved / recalibrate");
                    Add(ShellCommand.ToggleDiagnostics, state.DiagnosticsVisible ? "Hide diagnostics" : "Show diagnostics");
                    Add(ShellCommand.Back, "Back");
                    break;
                default:
                    title = "Trail";
                    notice = !c.Paired ? "Pair this headset to continue."
                        : c.IsAuthor ? "Paired as author." : "Paired as learner.";
                    Add(ShellCommand.OpenCreate, "Create tutorial");
                    Add(ShellCommand.OpenFollow, "Follow tutorial");
                    Add(ShellCommand.OpenLibrary, "Library");
                    Add(ShellCommand.OpenSettings, "Settings");
                    break;
            }
            return new ShellView(state.Route, title, notice, state.DiagnosticsVisible, entries);
        }

        private static bool Enabled(ShellState s, ShellCommand command, ShellConditions c)
        {
            switch (command)
            {
                case ShellCommand.Back: return s.Route != ShellRoute.Home;
                case ShellCommand.OpenSettings: return s.Route == ShellRoute.Home;
                case ShellCommand.OpenLibrary: return s.Route == ShellRoute.Home && c.Paired;
                // Only a paired author may enter authoring. No silent role escalation.
                case ShellCommand.OpenCreate: return s.Route == ShellRoute.Home && c.Paired && c.IsAuthor;
                case ShellCommand.OpenFollow: return s.Route == ShellRoute.Home && c.Paired;
                case ShellCommand.ToggleDiagnostics: return s.Route == ShellRoute.Settings;

                case ShellCommand.Calibrate:
                case ShellCommand.SampleMark:
                case ShellCommand.RecenterWorkspace: return s.Route == ShellRoute.Settings;

                // Authoring needs calibration and live hands; a save position established from
                // missing tracking would be a bogus workspace point reused by every later take.
                case ShellCommand.SetSavePosition:
                    return s.Route == ShellRoute.Create && c.Calibrated && c.HandsTracked && !c.SavePositionSet && !c.IsRecording;
                case ShellCommand.ChangeSavePosition:
                    return s.Route == ShellRoute.Create && c.Calibrated && c.HandsTracked && c.SavePositionSet && !c.IsRecording;
                case ShellCommand.StartRecording:
                    return s.Route == ShellRoute.Create && c.Calibrated && c.SavePositionSet && !c.IsRecording;
                // Explicit stop stays available for tasks that naturally end at the save position.
                case ShellCommand.StopRecording: return s.Route == ShellRoute.Create && c.IsRecording;
                case ShellCommand.DiscardTake: return s.Route == ShellRoute.Create && c.HasLastTake && !c.IsRecording;
                case ShellCommand.UploadLastCapture:
                    return s.Route == ShellRoute.Create && c.HasLastTake && !c.IsRecording && c.Paired && c.IsAuthor;

                case ShellCommand.NextGuide: return s.Route == ShellRoute.Library && c.LibraryHasEntries;
                case ShellCommand.PreloadSelected: return s.Route == ShellRoute.Library && c.LibraryHasEntries;
                case ShellCommand.RefreshLibrary: return s.Route == ShellRoute.Library && c.Paired;

                case ShellCommand.StartStep: return s.Route == ShellRoute.Follow && c.GuideLoaded && c.GuideAwaitingExplicitStart;
                case ShellCommand.Repeat: return s.Route == ShellRoute.Follow && c.GuideLoaded && c.Calibrated;
                case ShellCommand.Pause: return s.Route == ShellRoute.Follow && c.GuideActive && !c.GuidePaused;
                case ShellCommand.Resume: return s.Route == ShellRoute.Follow && c.GuidePaused;
                // Only a step actually authored as user-confirmed may be confirmed by hand.
                case ShellCommand.ConfirmStep: return s.Route == ShellRoute.Follow && c.GuideActive && c.GuideUserConfirmed;
                default: return false;
            }
        }

        private static string Reason(ShellState s, ShellCommand command, ShellConditions c)
        {
            if (Enabled(s, command, c)) return "";
            if (!c.Paired && (command == ShellCommand.OpenCreate || command == ShellCommand.OpenFollow ||
                command == ShellCommand.OpenLibrary || command == ShellCommand.RefreshLibrary ||
                command == ShellCommand.UploadLastCapture)) return "Pair this headset first.";
            if (!c.IsAuthor && (command == ShellCommand.OpenCreate || command == ShellCommand.UploadLastCapture))
                return "Pair as author to record.";
            if (!c.Calibrated && (command == ShellCommand.SetSavePosition || command == ShellCommand.ChangeSavePosition ||
                command == ShellCommand.StartRecording || command == ShellCommand.Repeat))
                return "Calibrate the workspace in Settings.";
            if (!c.HandsTracked && (command == ShellCommand.SetSavePosition || command == ShellCommand.ChangeSavePosition))
                return "Both hands must be tracked.";
            if (!c.SavePositionSet && command == ShellCommand.StartRecording) return "Set the save position first.";
            if (c.SavePositionSet && command == ShellCommand.SetSavePosition) return "Already set. Use Change save position.";
            if (!c.GuideLoaded && (command == ShellCommand.StartStep || command == ShellCommand.Repeat))
                return "Preload a guide in Library.";
            if (!c.LibraryHasEntries && (command == ShellCommand.NextGuide || command == ShellCommand.PreloadSelected))
                return "No ready guides.";
            if (command == ShellCommand.ConfirmStep && !c.GuideUserConfirmed)
                return "This step completes on movement, not confirmation.";
            return "Not available yet.";
        }
    }
}
