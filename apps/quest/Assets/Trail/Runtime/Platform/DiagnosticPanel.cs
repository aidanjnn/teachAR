namespace Trail.Runtime.Platform
{
    /// <summary>
    /// An engineering panel that the learner-facing shell may hide. Capture, guide,
    /// storage and inspection each ship one; they are diagnostics, not the guided
    /// experience, and a learner must never meet them by accident.
    /// </summary>
    public interface IDiagnosticPanel
    {
        void SetPanelVisible(bool visible);
    }
}
