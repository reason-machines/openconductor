"""Verify retained source provenance and the frozen hosted-regression inputs, without executing JS."""
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
PACKET_SHA = "00088ead476e92f357aa3bb056fafab20a2cda85c98705b9c71b047379e102f1"
FIXTURE_SHA = "8ccac9ae0b6d4319f6f2a0626404d4f67c462ffa018c4b6d43e49fa55a71a26c"
BEFORE = '              setAttachments((list) => addAttachment(list, { name: forkAttachmentName(c.title), text }));'
AFTER = '              const attachment: ComposerAttachment = { name: `session-transcript-${c.chatId}.md`, label: forkAttachmentName(c.title), text };\n              setAttachments((list) => addAttachment(list, attachment));'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify():
    packet = (EVIDENCE / "source-packet.tar.gz").read_bytes()
    assert digest(packet) == PACKET_SHA, "original packet bytes changed"
    with tarfile.open(fileobj=io.BytesIO(packet)) as archive:
        def read(name):
            member = archive.extractfile("workspace-chat-recent-chip-be7/" + name)
            assert member is not None, name
            return member.read()
        manifest = json.loads(read("manifest.json"))
        for item in manifest["files"]:
            data = read(item["path"])
            assert len(data) == item["bytes"] and digest(data) == item["sha256"], item["path"]
        receipt = json.loads(read("receipt.json"))
        for span in receipt["original_spans"]:
            data = read(span["file"])
            assert len(data) == span["bytes"] and digest(data) == span["sha256"], span["file"]
        reference = read("reference-RIo.txt").decode()
        assert 'm=I=>`Transcript of ${i.find(O=>O.id===I)?.title||"chat"}.md`' in reference
        assert 'g=I=>`session-transcript-${I}.md`' in reference
        assert 'const D=g(I),P=m(I),L=FO(e,D,O,P)' in reference
        sources = {
            "WorkspaceView.tsx": "src/components/WorkspaceView.tsx",
            "ChatEmptyState.tsx": "src/features/chat/ChatEmptyState.tsx",
            "chatAttachment.ts": "src/features/diff/chatAttachment.ts",
            "composerAttachments.ts": "src/features/chat/composerAttachments.ts",
            "composerSession.ts": "src/features/chat/composerSession.ts",
            "fork.ts": "src/features/chat/fork.ts",
        }
        baseline = read("WorkspaceView.tsx").decode()
        assert baseline.count(BEFORE) == 1
        product = (ROOT / sources["WorkspaceView.tsx"]).read_text()
        state = "baseline" if product == baseline else "fixed"
        assert product in (baseline, baseline.replace(BEFORE, AFTER)), "producer scope changed beyond the allowed identity hunk"
        for name, path in sources.items():
            if name != "WorkspaceView.tsx":
                assert (ROOT / path).read_bytes() == read(name), path
    fixture = (ROOT / "src/features/chat/recentTranscriptIdentity.test.ts").read_bytes()
    assert digest(fixture) == FIXTURE_SHA, "frozen baseline regression changed"
    return {"state": state, "packet_files": len(manifest["files"]), "retained_spans": len(receipt["original_spans"]), "source_files": len(sources), "fixture_sha256": FIXTURE_SHA, "runtime_executed": False}


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2))
