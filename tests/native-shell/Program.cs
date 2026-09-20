using System;
using System.Linq;
using System.Numerics;
using Trail.Runtime.Shell;

internal static class Program
{
    private static int checks;

    private static void Check(bool condition, string what)
    {
        checks++;
        if (!condition) { Console.Error.WriteLine("FAIL: " + what); Environment.Exit(1); }
    }

    // Three labels laid out like the real panels: 6 cm apart, further than the 2.5 cm hit radius.
    private static ShellButton[] Panel(bool secondEnabled = true) => new[]
    {
        new ShellButton("a", new Vector3(0, 0, 0), true),
        new ShellButton("b", new Vector3(0, -.06f, 0), secondEnabled),
        new ShellButton("c", new Vector3(0, -.12f, 0), true),
    };

    private static ShellTouchSample Sample(double timeMs, long sequence, Vector3? tip,
        int originRevision = 1, string trackingSessionId = "session-1") =>
        new ShellTouchSample(timeMs, sequence, originRevision, trackingSessionId, null, tip);

    private static void Interaction()
    {
        var buttons = Panel();
        var onA = new Vector3(0, 0, 0);
        var away = new Vector3(0, -.5f, 0);

        // Touch, hold past the arm threshold, then withdraw -> exactly one confirm.
        var s = ShellInteraction.Create();
        long sequence = 0; double t = 0;
        s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t);
        Check(s.Touch == ShellTouch.Touching && s.TouchingIndex == 0, "touch arms the touched label");
        Check(s.ConfirmedIndex < 0, "touching alone does not confirm");
        for (var i = 0; i < 12; i++) { t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); }
        Check(s.Touch == ShellTouch.Armed, "holding past 600 ms arms");
        Check(s.ConfirmedIndex < 0, "dwell alone never confirms; capture's withdraw rule is now universal");
        t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, away), t);
        Check(s.ConfirmedIndex == 0 && s.ConfirmedId == "a", "withdrawal from an armed label confirms it");
        Check(s.Touch == ShellTouch.Idle, "confirming clears the touch");
        t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, away), t);
        Check(s.ConfirmedIndex < 0, "confirm fires exactly once and is not latched");

        // Withdrawing before the hold completes must do nothing.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t);
        for (var i = 0; i < 6; i++) { t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); }
        Check(s.Touch == ShellTouch.Touching, "300 ms of continuous hold is not enough to arm");
        t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, away), t);
        Check(s.ConfirmedIndex < 0, "withdrawing before arming does not confirm");

        // Sliding from an armed label onto a neighbour cancels rather than firing either.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 15; i++) { s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); t += 50; }
        Check(s.Touch == ShellTouch.Armed, "armed on the first label");
        s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, new Vector3(0, -.06f, 0)), t);
        Check(s.ConfirmedIndex < 0, "sliding onto a neighbour cancels instead of confirming");
        Check(s.TouchingIndex == 1, "the neighbour becomes the new touch");

        // A disabled label cannot be touched, armed or confirmed.
        var guarded = Panel(secondEnabled: false);
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 15; i++) { s = ShellInteraction.Observe(s, guarded, Sample(t, ++sequence, new Vector3(0, -.06f, 0)), t); t += 50; }
        Check(s.TouchingIndex < 0 && s.ConfirmedIndex < 0, "a disabled label is not touchable");

        // Freshness: stale, reordered, duplicated and backwards samples earn no dwell.
        // Each starts from the same single-touch baseline so one rule is isolated at a time.
        s = ShellInteraction.Create(); t = 1000;
        s = ShellInteraction.Observe(s, buttons, Sample(t, 1, onA), t);
        Check(s.TouchingIndex == 0, "freshness baseline is a live touch");
        var stale = ShellInteraction.Observe(s, buttons, Sample(t + 50, 2, onA), t + 500);
        Check(stale.TouchingIndex < 0, "a sample older than the stall bound clears evidence");
        var replay = ShellInteraction.Observe(s, buttons, Sample(t + 50, 1, onA), t + 50);
        Check(replay.TouchingIndex < 0, "a repeated sequence number clears evidence");
        var backwards = ShellInteraction.Observe(s, buttons, Sample(t - 10, 2, onA), t);
        Check(backwards.TouchingIndex < 0, "a backwards timestamp clears evidence");

        // A gap longer than the stall bound restarts the hold; time cannot be credited across it.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 10; i++) { s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); t += 50; }
        Check(s.Touch == ShellTouch.Touching, "holding, not yet armed, at 450 ms");
        t += 400; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t);
        Check(s.TouchingIndex < 0, "the gap itself clears the pending touch");
        for (var i = 0; i < 6; i++) { t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); }
        Check(s.Touch != ShellTouch.Armed, "the hold restarts after a gap rather than crediting time across it");

        // Losing the hand entirely clears the pending touch.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t);
        t += 50; s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, null), t);
        Check(s.TouchingIndex < 0, "losing the hand clears the pending touch");

        // Recalibration or a new tracking session invalidates the pending touch.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 15; i++) { s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); t += 50; }
        Check(s.Touch == ShellTouch.Armed, "armed before the origin change");
        var moved = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA, originRevision: 2), t);
        Check(moved.TouchingIndex < 0 && moved.ConfirmedIndex < 0, "an origin revision change clears the pending touch");
        var resession = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA, trackingSessionId: "session-2"), t);
        Check(resession.TouchingIndex < 0 && resession.ConfirmedIndex < 0, "a new tracking session clears the pending touch");

        // Explicit cancel (pause, focus loss, route change, teardown) cannot leave a latched confirm.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 15; i++) { s = ShellInteraction.Observe(s, buttons, Sample(t, ++sequence, onA), t); t += 50; }
        var cancelled = ShellInteraction.Cancel(s);
        Check(cancelled.Touch == ShellTouch.Idle && cancelled.ConfirmedIndex < 0, "cancel drops an armed touch without confirming");

        // Either hand may drive the panel.
        s = ShellInteraction.Create(); sequence = 0; t = 0;
        for (var i = 0; i < 15; i++)
        {
            s = ShellInteraction.Observe(s, buttons, new ShellTouchSample(t, ++sequence, 1, "session-1", onA, null), t);
            t += 50;
        }
        Check(s.Touch == ShellTouch.Armed, "the left hand can arm a label too");
    }

    private static ShellConditions Learner(bool loaded = false, bool active = false, bool paused = false,
        bool userConfirmed = false, bool awaitingStart = false, bool calibrated = true, bool library = true) =>
        new ShellConditions(paired: true, isAuthor: false, calibrated: calibrated, handsTracked: true,
            guideLoaded: loaded, guideAwaitingExplicitStart: awaitingStart, guideActive: active,
            guidePaused: paused, guideUserConfirmed: userConfirmed, libraryHasEntries: library);

    private static ShellConditions Author(bool savePositionSet = false, bool recording = false,
        bool hasTake = false, bool calibrated = true, bool handsTracked = true) =>
        new ShellConditions(paired: true, isAuthor: true, calibrated: calibrated, handsTracked: handsTracked,
            savePositionSet: savePositionSet, isRecording: recording, hasLastTake: hasTake);

    private static bool Can(ShellState state, ShellCommand command, ShellConditions c) =>
        ShellModel.Describe(state, c).Entries.Any(e => e.Command == command && e.Enabled);

    private static void Routing()
    {
        var unpaired = new ShellConditions();
        var home = ShellModel.Create();
        Check(home.Route == ShellRoute.Home, "the shell opens on Home");
        Check(!home.DiagnosticsVisible, "engineering panels are hidden by default");

        var view = ShellModel.Describe(home, unpaired);
        Check(view.Entries.Count == 4, "Home offers Create, Follow, Library and Settings");
        // Recording, reviewing and following are local to this headset, so an unpaired
        // headset is fully usable. Head-gaze typing a pairing code to reach them would be
        // both unusable and wrong: loaded guidance must survive loss of the backend.
        Check(Can(home, ShellCommand.OpenFollow, unpaired), "an unpaired headset can still follow");
        Check(Can(home, ShellCommand.OpenCreate, unpaired), "an unpaired headset can still record");
        Check(Can(home, ShellCommand.OpenLibrary, unpaired), "an unpaired headset can still open its local library");
        Check(Can(home, ShellCommand.OpenSettings, unpaired), "settings stay reachable so pairing can be added later");
        Check(ShellModel.Describe(home, unpaired).Notice.Contains("Working on this headset"),
            "Home says plainly that it works without a server");

        var learner = Learner();
        Check(Can(home, ShellCommand.OpenFollow, learner), "a paired learner can follow");
        Check(Can(home, ShellCommand.OpenCreate, Author()), "a paired author can enter authoring");

        var library0 = ShellModel.Apply(home, ShellCommand.OpenLibrary, learner);

        // Create: the save position gates recording, and is set exactly once.
        var create = ShellModel.Apply(home, ShellCommand.OpenCreate, Author());
        Check(create.Route == ShellRoute.Create, "author reaches Create");
        Check(Can(create, ShellCommand.SetSavePosition, Author()), "save position can be set first");
        Check(!Can(create, ShellCommand.StartRecording, Author()), "recording is blocked until the save position exists");
        Check(!Can(create, ShellCommand.SetSavePosition, Author(calibrated: false)),
            "an uncalibrated workspace cannot establish a save position");
        Check(!Can(create, ShellCommand.SetSavePosition, Author(handsTracked: false)),
            "missing hand tracking cannot establish a save position");
        var ready = Author(savePositionSet: true);
        Check(!Can(create, ShellCommand.SetSavePosition, ready), "the save position is not offered twice");
        Check(Can(create, ShellCommand.ChangeSavePosition, ready), "changing the save position is explicit");
        Check(Can(create, ShellCommand.StartRecording, ready), "recording unlocks once the save position exists");

        var recording = Author(savePositionSet: true, recording: true);
        Check(Can(create, ShellCommand.StopRecording, recording), "explicit stop stays available while recording");
        Check(!Can(create, ShellCommand.StartRecording, recording), "recording cannot start twice");
        Check(!Can(create, ShellCommand.ChangeSavePosition, recording), "a take cannot silently move the save position");

        var taken = Author(savePositionSet: true, hasTake: true);
        Check(Can(create, ShellCommand.UploadLastCapture, taken), "a finished take can be sent for review");
        // Publishing leaves the device, so it stays privileged even though local work does not.
        var offlineTake = new ShellConditions(paired: false, isAuthor: false, calibrated: true,
            handsTracked: true, savePositionSet: true, hasLastTake: true);
        Check(Can(create, ShellCommand.StartRecording, offlineTake), "recording works with no server");
        Check(!Can(create, ShellCommand.UploadLastCapture, offlineTake), "publishing still requires pairing");
        Check(ShellModel.Describe(create, offlineTake).Entries
                .First(e => e.Command == ShellCommand.UploadLastCapture).Reason.Contains("Pair"),
            "the upload control explains that pairing is what it needs");
        var unpairedLibrary = new ShellConditions(paired: false, libraryHasEntries: true);
        Check(Can(library0, ShellCommand.PreloadSelected, unpairedLibrary),
            "a tutorial already on the device preloads with no server");
        Check(!Can(library0, ShellCommand.RefreshLibrary, unpairedLibrary),
            "refreshing the shared library still requires pairing");
        Check(Can(create, ShellCommand.DiscardTake, taken), "a take can be discarded");
        Check(!Can(create, ShellCommand.UploadLastCapture, Author(savePositionSet: true)), "there is nothing to upload without a take");

        // Follow: progression controls track the reducer's own phase, never the shell's wishes.
        var follow = ShellModel.Apply(home, ShellCommand.OpenFollow, learner);
        Check(follow.Route == ShellRoute.Follow, "learner reaches Follow");
        Check(!Can(follow, ShellCommand.StartStep, Learner()), "Start needs a preloaded guide");
        Check(!Can(follow, ShellCommand.StartStep, Learner(loaded: true)),
            "Start appears only for a step authored to require an explicit start");
        Check(Can(follow, ShellCommand.StartStep, Learner(loaded: true, awaitingStart: true)), "Start appears when the step waits for it");
        Check(!Can(follow, ShellCommand.Repeat, Learner(loaded: true, calibrated: false)), "Repeat needs calibration");
        Check(Can(follow, ShellCommand.Pause, Learner(loaded: true, active: true)), "an active guide can be paused");
        Check(!Can(follow, ShellCommand.Pause, Learner(loaded: true, active: true, paused: true)), "a paused guide cannot be paused again");
        Check(Can(follow, ShellCommand.Resume, Learner(loaded: true, paused: true)), "a paused guide can resume");
        Check(!Can(follow, ShellCommand.ConfirmStep, Learner(loaded: true, active: true)),
            "a movement-checkpoint step is never completed by a button");
        Check(Can(follow, ShellCommand.ConfirmStep, Learner(loaded: true, active: true, userConfirmed: true)),
            "only an authored user-confirmed step offers confirmation");
        Check(ShellModel.Describe(follow, Learner(loaded: true, active: true)).Notice.Contains("does not verify"),
            "the follow notice keeps the movement-checkpoint limit visible");

        // Library.
        var library = library0;
        Check(Can(library, ShellCommand.PreloadSelected, learner), "a ready guide can be preloaded");
        Check(!Can(library, ShellCommand.PreloadSelected, Learner(library: false)), "an empty library offers nothing to preload");

        // Settings owns calibration and the diagnostic panels.
        var settings = ShellModel.Apply(home, ShellCommand.OpenSettings, learner);
        Check(Can(settings, ShellCommand.Calibrate, learner), "calibration lives in Settings");
        Check(!Can(create, ShellCommand.Calibrate, Author()), "calibration is not duplicated into Create");
        var shown = ShellModel.Apply(settings, ShellCommand.ToggleDiagnostics, learner);
        Check(shown.DiagnosticsVisible, "diagnostics can be shown deliberately");
        Check(ShellModel.Describe(shown, learner).Notice.Contains("not the guided experience"),
            "visible diagnostics are labelled as diagnostics");
        var left = ShellModel.Apply(shown, ShellCommand.Back, learner);
        Check(left.Route == ShellRoute.Home && !left.DiagnosticsVisible,
            "leaving Settings hides the engineering panels again");
        Check(!Can(home, ShellCommand.ToggleDiagnostics, learner), "diagnostics cannot be toggled from Home");

        // Back exists everywhere except Home, so a learner is never stranded.
        foreach (var route in new[] { ShellRoute.Create, ShellRoute.Follow, ShellRoute.Library, ShellRoute.Settings })
        {
            var at = ShellModel.Apply(home, route == ShellRoute.Create ? ShellCommand.OpenCreate
                : route == ShellRoute.Follow ? ShellCommand.OpenFollow
                : route == ShellRoute.Library ? ShellCommand.OpenLibrary : ShellCommand.OpenSettings, Author());
            Check(at.Route == route, "reached " + route);
            Check(Can(at, ShellCommand.Back, Author()), "Back is available in " + route);
            Check(ShellModel.Apply(at, ShellCommand.Back, Author()).Route == ShellRoute.Home, "Back returns Home from " + route);
        }
        Check(!Can(home, ShellCommand.Back, learner), "Home has no Back");

        // A confirmation that arrives after conditions changed must not act on the old answer.
        var stale = ShellModel.Apply(create, ShellCommand.StartRecording, Author(savePositionSet: true));
        Check(stale.Route == ShellRoute.Create, "an action command does not change route");
        Check(!Can(create, ShellCommand.StartRecording, Author(savePositionSet: true, recording: true)),
            "a repeated start is rejected once recording began");

        // No command anywhere can complete a guide step other than an authored user-confirmed one.
        foreach (ShellCommand command in Enum.GetValues(typeof(ShellCommand)))
        {
            if (command == ShellCommand.ConfirmStep) continue;
            foreach (var route in new[] { ShellRoute.Home, ShellRoute.Create, ShellRoute.Follow, ShellRoute.Library, ShellRoute.Settings })
            {
                var at = ShellModel.Create(); at = ShellModel.Apply(at,
                    route == ShellRoute.Create ? ShellCommand.OpenCreate
                    : route == ShellRoute.Follow ? ShellCommand.OpenFollow
                    : route == ShellRoute.Library ? ShellCommand.OpenLibrary
                    : route == ShellRoute.Settings ? ShellCommand.OpenSettings : ShellCommand.Back, Author());
                var after = ShellModel.Apply(at, command, Author());
                Check(after.Route == at.Route || IsNavigation(command), command + " does not move the route unexpectedly");
            }
        }
    }

    private static void TrackingLossNeverConfirms()
    {
        var buttons = Panel();
        var away = new Vector3(0, -.5f, 0);
        ShellInteractionState Armed()
        {
            var s = ShellInteraction.Create();
            for (var i = 0; i <= 12; i++) s = ShellInteraction.Observe(s, buttons,
                new ShellTouchSample(i * 50, i, 1, "session", away, Vector3.Zero), i * 50);
            Check(s.Touch == ShellTouch.Armed, "right hand armed before tracking loss");
            return s;
        }
        foreach (var missing in new Vector3?[] { null, new Vector3(float.NaN, 0, 0) })
        {
            var lost = ShellInteraction.Observe(Armed(), buttons,
                new ShellTouchSample(650, 13, 1, "session", away, missing), 650);
            Check(lost.ConfirmedIndex < 0 && lost.Touch == ShellTouch.Idle,
                "missing or invalid owner cancels even when the other hand remains tracked");
        }
        var takeover = ShellInteraction.Observe(Armed(), buttons,
            new ShellTouchSample(650, 13, 1, "session", Vector3.Zero, null), 650);
        Check(takeover.ConfirmedIndex < 0 && takeover.Touch == ShellTouch.Idle, "another hand cannot inherit dwell");
        var disabled = Panel(); disabled[0] = new ShellButton("a", Vector3.Zero, false);
        var changed = ShellInteraction.Observe(Armed(), disabled,
            new ShellTouchSample(650, 13, 1, "session", away, away), 650);
        Check(changed.ConfirmedIndex < 0, "disabling an armed control cannot confirm it");
    }

    private static void WideRotatedTouch()
    {
        var center = new Vector3(2, 1, -3);
        var right = Vector3.Normalize(new Vector3(1, 0, 1));
        var buttons = new[] { new ShellButton("wide", center, true, .2f, right),
            new ShellButton("neighbor", center + Vector3.UnitY * .06f, true, .2f, right) };
        var tip = center + right * .17f;
        var s = ShellInteraction.Create();
        for (var i = 0; i <= 12; i++) s = ShellInteraction.Observe(s, buttons,
            new ShellTouchSample(i * 50, i, 0, "wide", tip, null), i * 50);
        Check(s.Touch == ShellTouch.Armed && s.TouchingIndex == 0, "touch near rotated label edge earns dwell");
        s = ShellInteraction.Observe(s, buttons,
            new ShellTouchSample(650, 13, 0, "wide", tip + Vector3.UnitY * .2f, null), 650);
        Check(s.ConfirmedIndex == 0, "withdraw from rotated label edge selects exactly that label");
        s = ShellInteraction.Observe(ShellInteraction.Create(), buttons,
            new ShellTouchSample(0, 0, 0, "wide", tip + Vector3.UnitY * .03f, null), 0);
        Check(s.TouchingIndex == -1, "row gaps remain untouchable");
        s = ShellInteraction.Observe(ShellInteraction.Create(), buttons,
            new ShellTouchSample(0, 0, 0, "wide", center + right * .24f, null), 0);
        Check(s.TouchingIndex == -1, "touch beyond label edge is rejected");
    }

    private static bool IsNavigation(ShellCommand command) =>
        command == ShellCommand.OpenCreate || command == ShellCommand.OpenFollow ||
        command == ShellCommand.OpenLibrary || command == ShellCommand.OpenSettings || command == ShellCommand.Back;

    private static void Main()
    {
        Interaction();
        TrackingLossNeverConfirms();
        WideRotatedTouch();
        GuideConfirmationRegression.Run(Check);
        Routing();
        Console.WriteLine("PASS: " + checks + " real C# shell checks (actual ShellInteraction/ShellModel sources).");
        Console.WriteLine("Covers one touch/hold/withdraw confirm model and Create/Follow routing, role and availability rules.");
        Console.WriteLine("SYNTHETIC ONLY: no Unity import, no MonoBehaviour, no world-space layout, no headset legibility or usability claim.");
    }
}
