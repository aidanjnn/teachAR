using System;
using System.Collections;
using System.Collections.Generic;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using NUnit.Framework;
using Trail.Runtime.Network;
using Trail.Runtime.Platform;
using Trail.Runtime.Shell;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Trail.Tests
{
    public sealed class ShellPointerTests
    {
        private sealed class FakePointers : IShellPointerSource
        {
            public ShellPointerFrame Left, Right;
            public ShellPointerFrame Read(bool left) => left ? Left : Right;
            public void Set(bool left, ShellPointerFrame frame) { if (left) Left = frame; else Right = frame; }
        }
        private sealed class Fixture : IDisposable
        {
            public readonly GameObject Root;
            public readonly TutorialExperienceController Shell;
            public readonly NativeShellPointer Pointer;
            public readonly FakePointers Input = new FakePointers();
            public readonly Transform panel;
            public readonly Camera Head;
            public readonly ShellTestHands Hands;
            public Fixture(bool withHead = false, Func<bool> headReady = null)
            {
                Root = new GameObject("point and pinch shell fixture");
                var tracking = new GameObject("rotated tracking space"); tracking.transform.SetParent(Root.transform);
                tracking.transform.position = new Vector3(2, .2f, -3);
                tracking.transform.rotation = Quaternion.Euler(0, 67, 0);
                if (withHead)
                {
                    var eye = new GameObject("head"); eye.transform.SetParent(tracking.transform, false);
                    eye.transform.localPosition = new Vector3(.7f, 1.6f, -.3f);
                    eye.transform.localRotation = Quaternion.Euler(12, 35, 0);
                    Head = eye.AddComponent<Camera>();
                }
                Hands = Root.AddComponent<ShellTestHands>(); Hands.TrackingSpace = tracking.transform;
                var capture = Root.AddComponent<CaptureReplaySession>(); capture.Source = Hands;
                var connection = Root.AddComponent<NativeApiConnection>();
                Shell = Root.AddComponent<TutorialExperienceController>();
                Shell.HeadPoseReadyForPlacement = headReady;
                Shell.Initialize(new PlatformContext(Root, tracking.transform, Head, connection));
                panel = tracking.transform.Find("Trail shell"); Pointer = panel.GetComponent<NativeShellPointer>();
                Pointer.Source = Input;
            }
            public TextMesh Button(int index) => panel.Find("Shell button " + index).GetComponent<TextMesh>();
            public ShellPointerFrame Aim(int index, bool pinching)
            {
                var button = Button(index).transform;
                // Intentionally away from the old 2.5 cm fingertip target. The ray must
                // select the label area, with its rotated/translated world transform.
                var target = button.TransformPoint(new Vector3(.08f, 0, 0));
                return new ShellPointerFrame(new Ray(target - button.forward * .6f, button.forward), pinching);
            }
            public void Dispose() => Object.Destroy(Root);
        }

        [UnityTest]
        public IEnumerator MenuWaitsForWornTrackedHeadBeforeChoosingItsPosition()
        {
            var ready = false;
            using (var f = new Fixture(true, () => ready))
            {
                yield return null; yield return null;
                Assert.IsFalse(f.panel.gameObject.activeSelf, "do not display the menu at a default pose while tracking is unavailable");
                f.Head.transform.position = new Vector3(-2, 1.3f, 4);
                f.Head.transform.rotation = Quaternion.Euler(0, -40, 0);
                ready = true;
                yield return null;
                yield return new WaitForSecondsRealtime(.6f);
                Assert.IsTrue(f.panel.gameObject.activeSelf);
                var expected = f.Head.transform.position + f.Head.transform.forward * .5f - Vector3.up * .2f;
                Assert.Less(Vector3.Distance(expected, f.panel.position), .001f,
                    "menu must use the recovered pose, not the earlier off-head pose");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator GrabHandleMovesInDepthAndSidewaysThenStaysPutOnReleaseOrTrackingLoss()
        {
            foreach (var left in new[] { true, false })
            {
                using (var f = new Fixture())
                {
                    yield return null; yield return null;
                    var handle = f.Pointer.MoveHandle.transform;
                    var original = f.panel.position;
                    var ray = new Ray(handle.position - handle.forward * .6f, handle.forward);
                    f.Input.Set(left, new ShellPointerFrame(ray, false));
                    yield return null; yield return null;
                    f.Input.Set(left, new ShellPointerFrame(ray, true));
                    yield return null; yield return null;
                    Assert.IsTrue(f.Pointer.IsDragging);
                    var offset = handle.forward * .25f + handle.right * .15f;
                    f.Input.Set(left, new ShellPointerFrame(new Ray(ray.origin + offset, ray.direction), true));
                    yield return null; yield return null;
                    Assert.Less(Vector3.Distance(original + offset, f.panel.position), .001f, "grab must move farther and sideways with the hand");
                    var toward = -handle.forward * .15f;
                    f.Input.Set(left, new ShellPointerFrame(new Ray(ray.origin + toward, ray.direction), true));
                    yield return null; yield return null;
                    Assert.Less(Vector3.Distance(original + toward, f.panel.position), .001f, "grab must also move closer");
                    f.Input.Set(left, new ShellPointerFrame(new Ray(ray.origin + toward, ray.direction), false));
                    yield return null; yield return null;
                    Assert.IsFalse(f.Pointer.IsDragging);
                    var released = f.panel.position;
                    f.Input.Set(left, new ShellPointerFrame(ray, false));
                    yield return null; yield return null;
                    Assert.AreEqual(released, f.panel.position, "release leaves the menu in place");
                    ray = new Ray(handle.position - handle.forward * .6f, handle.forward);
                    f.Input.Set(left, new ShellPointerFrame(ray, false)); yield return null; yield return null;
                    f.Input.Set(left, new ShellPointerFrame(ray, true)); yield return null; yield return null;
                    Assert.IsTrue(f.Pointer.IsDragging);
                    f.Input.Set(left, default); yield return null; yield return null;
                    Assert.IsFalse(f.Pointer.IsDragging);
                    f.Input.Set(left, new ShellPointerFrame(new Ray(ray.origin + offset, ray.direction), true));
                    yield return null; yield return null;
                    Assert.AreEqual(released, f.panel.position, "tracking reacquisition while pinched must not resume dragging");
                    Assert.AreEqual(ShellRoute.Home, f.Shell.Route, "moving the panel must not select menu actions");
                }
                yield return null;
            }
        }

        [UnityTest]
        public IEnumerator MenuStartsWithinReachFacingHeadAndStaysStillDuringInteraction()
        {
            using (var f = new Fixture(true))
            {
                yield return null; yield return new WaitForSecondsRealtime(.6f);
                var forward = Vector3.ProjectOnPlane(f.Head.transform.forward, Vector3.up).normalized;
                Assert.Less(Vector3.Distance(f.panel.position,
                    f.Head.transform.position + forward * .5f - Vector3.up * .2f), .001f);
                Assert.Greater(Vector3.Dot(f.panel.forward, forward), .999f);
                var placed = f.panel.position;
                f.Head.transform.position += Vector3.right;
                f.Head.transform.Rotate(0, 60, 0);
                yield return null;
                Assert.AreEqual(placed, f.panel.position, "menu must not chase the user's head during touch");
                f.Shell.SendMessage("OnApplicationFocus", false);
                yield return null;
                Assert.AreEqual(placed, f.panel.position, "do not reposition while unfocused");
                f.Shell.SendMessage("OnApplicationFocus", true);
                yield return null; yield return new WaitForSecondsRealtime(.6f);
                Assert.Greater(Vector3.Distance(placed, f.panel.position), .2f, "returning from system UI brings the menu back");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator TouchingLabelEdgeWinsOverAimRayAndWithdrawsToSelect()
        {
            using (var f = new Fixture())
            {
                yield return null; yield return null;
                f.Input.Left = f.Aim(0, false);
                yield return null; yield return new WaitForFixedUpdate();
                Assert.IsTrue(f.Pointer.IsAimingAtMenu);
                var edge = f.Button(0).transform.TransformPoint(new Vector3(.10f, 0, 0));
                for (var i = 0; i < 17; i++)
                {
                    f.Hands.Emit(edge);
                    yield return new WaitForSecondsRealtime(.045f);
                }
                Assert.IsTrue(f.Pointer.DirectTouchActive, "aiming must not cancel near touch");
                Assert.AreEqual(Color.green, f.Button(0).color, "armed touch needs visible feedback");
                Assert.AreEqual(ShellRoute.Home, f.Shell.Route, "holding alone must not select");
                f.Hands.Emit(edge - f.Button(0).transform.forward * .12f);
                yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Create, f.Shell.Route);
                Assert.IsFalse(f.Button(0).text.Contains("Calibrate"), "disabled reasons must not widen the button label");
                var reason = f.panel.Find("Shell reason 0").GetComponent<TextMesh>();
                StringAssert.Contains("Calibrate", reason.text);
                var notice = f.panel.Find("Shell notice").GetComponent<TextMesh>();
                StringAssert.Contains("\n", notice.text, "long notices must wrap within the panel");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator EitherHandSelectsWithOnePinchAndHeldPinchDoesNotRepeat()
        {
            foreach (var left in new[] { true, false })
            {
                using (var f = new Fixture())
                {
                    yield return null; yield return null;
                    f.Input.Set(left, f.Aim(0, true));
                    yield return null; yield return null;
                    Assert.AreEqual(ShellRoute.Home, f.Shell.Route, "Acquiring an already-pinched hand must not click");
                    f.Input.Set(left, f.Aim(0, false));
                    yield return null; yield return null;
                    // The pointer applies feedback in LateUpdate. Observe after that
                    // frame, before the shell's next Update resets baseline colors.
                    yield return new WaitForFixedUpdate();
                    Assert.IsTrue(f.Pointer.IsAimingAtMenu);
                    Assert.AreEqual(Color.cyan, f.Button(0).color, "The target must visibly highlight before pinching");
                    f.Input.Set(left, f.Aim(0, true));
                    yield return null; yield return null;
                    Assert.AreEqual(ShellRoute.Create, f.Shell.Route);
                    f.Input.Set(left, f.Aim(6, true)); // Back on the Create route.
                    yield return null; yield return null;
                    Assert.AreEqual(ShellRoute.Create, f.Shell.Route, "A held pinch moved onto another target must not click");
                    f.Input.Set(left, f.Aim(6, false));
                    yield return null; yield return null;
                    f.Input.Set(left, f.Aim(6, true));
                    yield return null; yield return null;
                    Assert.AreEqual(ShellRoute.Home, f.Shell.Route);
                    Assert.IsTrue(f.Root.activeInHierarchy, "Menu selection must preserve the application root");
                }
                yield return null;
            }
        }

        [UnityTest]
        public IEnumerator DisabledEntriesFocusLossAndTrackingLossCannotActivateCommands()
        {
            using (var f = new Fixture())
            {
                yield return null; yield return null;
                f.Input.Left = f.Aim(0, false); yield return null; yield return null;
                f.Input.Left = f.Aim(0, true); yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Create, f.Shell.Route);
                f.Input.Left = f.Aim(0, false); yield return null; yield return null;
                Assert.IsFalse(f.Pointer.IsAimingAtMenu, "Set save position is disabled before calibration");
                f.Input.Left = f.Aim(0, true); yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Create, f.Shell.Route);

                f.Input.Left = f.Aim(6, false); yield return null; yield return null;
                f.Pointer.SendMessage("OnApplicationFocus", false);
                f.Input.Left = f.Aim(6, true); yield return null; yield return null;
                f.Pointer.SendMessage("OnApplicationFocus", true);
                yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Create, f.Shell.Route, "Holding through focus loss must not click on resume");

                f.Input.Left = f.Aim(6, false); yield return null; yield return null;
                f.Input.Left = default; yield return null; yield return null;
                f.Input.Left = f.Aim(6, true); yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Create, f.Shell.Route, "Tracking reacquisition while pinched must not click");
                f.Input.Left = f.Aim(6, false); yield return null; yield return null;
                f.Input.Left = f.Aim(6, true); yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Home, f.Shell.Route, "A fresh release and pinch must work after recovery");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator SimultaneousHandsCannotDispatchIntoANewRoute()
        {
            using (var f = new Fixture())
            {
                yield return null; yield return null;
                f.Input.Left = f.Aim(2, false); f.Input.Right = f.Aim(3, false);
                yield return null; yield return null;
                f.Input.Left = f.Aim(2, true); f.Input.Right = f.Aim(3, true);
                yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Library, f.Shell.Route,
                    "One pinch opens Library; the other must not select Settings or the new route's Back slot");
                yield return null; yield return null;
                Assert.AreEqual(ShellRoute.Library, f.Shell.Route);
            }
            yield return null;
        }
    }
    public sealed class ShellTestHands : HandObservationSource
    {
        private long sequence;
        public override string SourceKind => "synthetic-test";
        public override string Availability => "synthetic-test";
        public void Emit(Vector3 world)
        {
            var p = TrackingSpace.InverseTransformPoint(world);
            var hand = new HandSample { Status = "valid", Joints = new Dictionary<string, CanonicalPose> {
                ["index-finger-tip"] = new CanonicalPose(new System.Numerics.Vector3(p.x, p.y, -p.z),
                    System.Numerics.Quaternion.Identity) } };
            Publish(new ReferenceObservation(MotionClock.NowMs, sequence++, OriginRevision, SourceKind, hand, MotionSamples.Missing()));
        }
    }

}
