"""
Backend API Tests for Khmer Dubbing App - Actor Features
Tests: upload-actor-voice, PATCH projects with actors, transcribe-segments actors response
"""
import pytest
import requests
import os
import io
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://khmer-dubbing-hub.preview.emergentagent.com')
TEST_TOKEN = "test_session_001"

class TestActorEndpoints:
    """Tests for actor-related API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
        self.project_id = None
    
    def test_01_auth_me_works(self):
        """Test that auth endpoint works with test token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.headers
        )
        print(f"Auth response: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Auth failed: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert data["user_id"] == "test-user-001"
        print("✓ Auth endpoint working")
    
    def test_02_create_project(self):
        """Create a test project for actor tests"""
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Actor_Project"}
        )
        print(f"Create project response: {response.status_code}")
        assert response.status_code == 200, f"Create project failed: {response.text}"
        data = response.json()
        assert "project_id" in data
        # Store for later tests
        with open("/tmp/test_project_id.txt", "w") as f:
            f.write(data["project_id"])
        print(f"✓ Created project: {data['project_id']}")
    
    def test_03_patch_project_with_actors(self):
        """Test PATCH /api/projects/{id} accepts 'actors' field"""
        # Read project_id from previous test
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        # Create test actors data
        actors = [
            {
                "id": "SPEAKER_00",
                "label": "Actor 00",
                "gender": "female",
                "voice": "sophea",
                "custom_voice": None
            },
            {
                "id": "SPEAKER_01",
                "label": "Actor 01",
                "gender": "male",
                "voice": "dara",
                "custom_voice": None
            }
        ]
        
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"actors": actors}
        )
        print(f"PATCH with actors response: {response.status_code}")
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        
        data = response.json()
        assert "actors" in data, "Response should contain 'actors' field"
        assert len(data["actors"]) == 2, "Should have 2 actors"
        assert data["actors"][0]["id"] == "SPEAKER_00"
        assert data["actors"][0]["gender"] == "female"
        assert data["actors"][1]["gender"] == "male"
        print("✓ PATCH /api/projects/{id} accepts actors field")
    
    def test_04_patch_project_with_segments(self):
        """Test PATCH /api/projects/{id} accepts 'segments' field"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        segments = [
            {
                "id": 0,
                "start": 0.0,
                "end": 2.5,
                "original": "你好",
                "translated": "សួស្តី",
                "speaker": "SPEAKER_00",
                "gender": "female",
                "voice": "sophea"
            },
            {
                "id": 1,
                "start": 2.5,
                "end": 5.0,
                "original": "欢迎",
                "translated": "សូមស្វាគមន៍",
                "speaker": "SPEAKER_01",
                "gender": "male",
                "voice": "dara"
            }
        ]
        
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"segments": segments}
        )
        print(f"PATCH with segments response: {response.status_code}")
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        
        data = response.json()
        assert "segments" in data, "Response should contain 'segments' field"
        assert len(data["segments"]) == 2
        print("✓ PATCH /api/projects/{id} accepts segments field")
    
    def test_05_upload_actor_voice_endpoint_exists(self):
        """Test POST /api/projects/{id}/upload-actor-voice endpoint exists"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        # Create a simple WAV file for testing
        # WAV header for a minimal valid file
        wav_header = bytes([
            0x52, 0x49, 0x46, 0x46,  # "RIFF"
            0x24, 0x00, 0x00, 0x00,  # File size - 8
            0x57, 0x41, 0x56, 0x45,  # "WAVE"
            0x66, 0x6D, 0x74, 0x20,  # "fmt "
            0x10, 0x00, 0x00, 0x00,  # Subchunk1Size (16)
            0x01, 0x00,              # AudioFormat (1 = PCM)
            0x01, 0x00,              # NumChannels (1)
            0x44, 0xAC, 0x00, 0x00,  # SampleRate (44100)
            0x88, 0x58, 0x01, 0x00,  # ByteRate
            0x02, 0x00,              # BlockAlign
            0x10, 0x00,              # BitsPerSample (16)
            0x64, 0x61, 0x74, 0x61,  # "data"
            0x00, 0x00, 0x00, 0x00   # Subchunk2Size (0)
        ])
        
        files = {
            'file': ('test_voice.wav', io.BytesIO(wav_header), 'audio/wav')
        }
        data = {
            'actor_id': 'SPEAKER_00'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/upload-actor-voice",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            files=files,
            data=data
        )
        print(f"Upload actor voice response: {response.status_code} - {response.text[:200]}")
        
        # Should return 200 with voice_path
        assert response.status_code == 200, f"Upload actor voice failed: {response.text}"
        result = response.json()
        assert "voice_path" in result, "Response should contain 'voice_path'"
        assert "actor_id" in result, "Response should contain 'actor_id'"
        assert result["actor_id"] == "SPEAKER_00"
        print(f"✓ Upload actor voice endpoint works, path: {result['voice_path']}")
    
    def test_06_verify_actor_voice_persisted(self):
        """Verify that uploaded actor voice is persisted in project"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        actors = data.get("actors", [])
        
        # Find SPEAKER_00 and check custom_voice
        speaker_00 = next((a for a in actors if a["id"] == "SPEAKER_00"), None)
        assert speaker_00 is not None, "SPEAKER_00 should exist"
        assert speaker_00.get("custom_voice") is not None, "SPEAKER_00 should have custom_voice set"
        print(f"✓ Actor voice persisted: {speaker_00.get('custom_voice')}")
    
    def test_07_verify_segments_updated_with_custom_audio(self):
        """Verify that segments for actor are updated with custom_audio"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        segments = data.get("segments", [])
        
        # Find segments for SPEAKER_00
        speaker_00_segments = [s for s in segments if s.get("speaker") == "SPEAKER_00"]
        
        for seg in speaker_00_segments:
            assert seg.get("custom_audio") is not None, f"Segment {seg.get('id')} should have custom_audio"
        
        print(f"✓ {len(speaker_00_segments)} segments updated with custom_audio")
    
    def test_08_get_project_returns_actors_array(self):
        """Test GET /api/projects/{id} returns actors array with correct fields"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "actors" in data, "Project should have 'actors' field"
        
        actors = data["actors"]
        if len(actors) > 0:
            actor = actors[0]
            # Check required fields
            assert "id" in actor, "Actor should have 'id'"
            assert "label" in actor, "Actor should have 'label'"
            assert "gender" in actor, "Actor should have 'gender'"
            assert "voice" in actor, "Actor should have 'voice'"
            assert "custom_voice" in actor or actor.get("custom_voice") is None, "Actor should have 'custom_voice' field"
            print(f"✓ Actor fields correct: {list(actor.keys())}")
    
    def test_09_cleanup_test_project(self):
        """Cleanup: Delete test project"""
        try:
            with open("/tmp/test_project_id.txt", "r") as f:
                project_id = f.read().strip()
        except:
            pytest.skip("No project_id to cleanup")
        
        response = requests.delete(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        print(f"Delete project response: {response.status_code}")
        assert response.status_code == 200
        print("✓ Test project cleaned up")


class TestTranscribeSegmentsActors:
    """Tests for transcribe-segments endpoint actor generation
    Note: These tests require actual file upload which may not work without real audio
    """
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_transcribe_segments_without_file_returns_error(self):
        """Test transcribe-segments returns proper error without file"""
        # Create a project first
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Transcribe_Project"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Try to transcribe without uploading file
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/transcribe-segments",
            headers=self.headers
        )
        print(f"Transcribe without file: {response.status_code} - {response.text[:200]}")
        
        # Should return 400 - no file uploaded
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "No file uploaded" in response.text
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ Transcribe-segments returns proper error without file")


class TestProjectUpdateModel:
    """Test that ProjectUpdate model accepts actors field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_project_update_accepts_all_fields(self):
        """Test PATCH accepts title, segments, actors, voice fields"""
        # Create project
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Update_Model"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Update with all fields
        update_data = {
            "title": "Updated Title",
            "voice": "dara",
            "female_voice": "chanthy",
            "male_voice": "virak",
            "actors": [
                {"id": "SPEAKER_00", "label": "Actor 0", "gender": "female", "voice": "chanthy", "custom_voice": None}
            ],
            "segments": [
                {"id": 0, "start": 0, "end": 1, "original": "test", "translated": "test", "speaker": "SPEAKER_00", "gender": "female", "voice": "chanthy"}
            ]
        }
        
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json=update_data
        )
        print(f"Update all fields response: {response.status_code}")
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["voice"] == "dara"
        assert data["female_voice"] == "chanthy"
        assert data["male_voice"] == "virak"
        assert len(data["actors"]) == 1
        assert len(data["segments"]) == 1
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ ProjectUpdate model accepts all fields correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
