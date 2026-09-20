using System;
using System.Collections;
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
            private readonly Transform panel;
            public Fixture()
            {
                Root = new GameObject("point and pinch shell fixture");
                var tracking = new GameObject("rotated tracking space"); tracking.transform.SetParent(Root.transform);
                tracking.transform.position = new Vector3(2, .2f, -3);
                tracking.transform.rotation = Quaternion.Euler(0, 67, 0);
                var connection = Root.AddComponent<NativeApiConnection>();
                Shell = Root.AddComponent<TutorialExperienceController>();
                Shell.Initialize(new PlatformContext(Root, tracking.transform, null, connection));
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
}
