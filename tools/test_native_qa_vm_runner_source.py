"""Source wiring checks, not Objective-C execution or confinement evidence."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RunnerSourceTests(unittest.TestCase):
    def test_admission_precedes_resource_acquisition(self):
        source = (ROOT / "native-qa-vm-runner/Runner.m").read_text()
        main = source[source.index("int main("):]
        self.assertLess(main.index("!OCVMAdmitNative()"), main.index("runWithArgs:&args"))
        self.assertNotIn("OCVMValidateResource(", main)

    def test_invocation_owns_configuration_and_same_vm_observation(self):
        source = (ROOT / "native-qa-vm-runner/Runner.m").read_text()
        self.assertIn("OCVMHoldResources(args, &_resources)", source)
        self.assertIn("[OCVMConfigurationFactory prepareProfile:&profile", source)
        self.assertIn("initWithConfiguration:configuration queue:dispatch_get_main_queue()", source)
        self.assertIn("_vm.state == VZVirtualMachineStateStopped", source)
        self.assertIn("OCVMLifecycleObserveStopped(&_lifecycle, owner", source)
        self.assertIn("OCVMLifecycleCanRelease(&invocation->_lifecycle)", source)

    def test_transport_is_explicitly_unimplemented(self):
        source = (ROOT / "native-qa-vm-runner/Runner.m").read_text()
        self.assertIn("static BOOL OCVMWorkloadChannelAvailable(void) { return NO; }", source)
        self.assertIn("OC_VM_FAILURE_WORKLOAD_UNSUPPORTED", source)
        self.assertIn('"same_vm_stopped":false', source.replace('\\"', '"'))
        self.assertIn("_Exit(75)", source)


if __name__ == "__main__":
    unittest.main()
