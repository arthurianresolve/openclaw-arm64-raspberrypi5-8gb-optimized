import Testing
@testable import OpenClawLinuxFixture

@Test
func markerIsStable() {
    let fixture = OpenClawLinuxFixture()
    #expect(fixture.toolchainMarker() == "linux-fixture-ready")
}
