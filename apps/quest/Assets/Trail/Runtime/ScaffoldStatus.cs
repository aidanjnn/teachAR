using UnityEngine;

namespace Trail.Runtime
{
    public sealed class ScaffoldStatus : MonoBehaviour
    {
        private void Start()
        {
            Debug.Log("Trail scaffold only: XR rig, capture, calibration, guide, camera and voice adapters are not implemented.");
        }
    }
}
