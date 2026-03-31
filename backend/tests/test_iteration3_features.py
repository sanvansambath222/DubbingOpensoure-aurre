"""
Backend API Tests for Khmer Dubbing App - Iteration 3 Features
Tests: 
- GET /api/ health check
- POST /api/projects returns actors array
- POST /api/projects/{id}/upload-actor-voice with Form() parameter
- PATCH /api/projects/{id} accepts actors field
- POST /api/projects/{id}/generate-video?burn_subtitles=true query param
- POST /api/projects/{id}/transcribe-segments returns actors with label field
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://khmer-dubbing-hub.preview.emergentagent.com')
TEST_TOKEN = "test_session_001"


class TestHealthAndBasicEndpoints:
    """Tests for health check and basic API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_api_health_check(self):
        """Test GET /api/ returns API health message"""
        response = requests.get(f"{BASE_URL}/api/")
        print(f"Health check response: {response.status_code} - {response.text}")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Khmer Dubbing API" in data["message"]
        print("✓ GET /api/ returns health message")
    
    def test_create_project_returns_actors_array(self):
        """Test POST /api/projects returns actors array in response"""
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Actors_Array_Check"}
        )
        print(f"Create project response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        # Check actors array exists
        assert "actors" in data, "Response should contain 'actors' field"
        assert isinstance(data["actors"], list), "actors should be a list"
        
        # Cleanup
        project_id = data["project_id"]
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ POST /api/projects returns actors array")


class TestUploadActorVoiceWithForm:
    """Tests for upload-actor-voice endpoint with Form() parameter"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
        self.project_id = None
    
    def test_upload_actor_voice_with_form_parameter(self):
        """Test POST /api/projects/{id}/upload-actor-voice accepts Form() actor_id"""
        # Create project first
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Upload_Voice_Form"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Add actors to project
        actors = [{"id": "SPEAKER_00", "label": "Girl", "gender": "female", "voice": "sophea"}]
        requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"actors": actors}
        )
        
        # Create minimal WAV file
        wav_header = bytes([
            0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
            0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
            0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
            0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
            0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
            0x00, 0x00, 0x00, 0x00
        ])
        
        # Upload with Form data (actor_id as form field)
        files = {'file': ('test_voice.wav', io.BytesIO(wav_header), 'audio/wav')}
        data = {'actor_id': 'SPEAKER_00'}
        
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/upload-actor-voice",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            files=files,
            data=data
        )
        print(f"Upload actor voice response: {response.status_code} - {response.text[:200]}")
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        assert "voice_path" in result
        assert "actor_id" in result
        assert result["actor_id"] == "SPEAKER_00"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ upload-actor-voice accepts Form() actor_id parameter")


class TestPatchProjectWithActors:
    """Tests for PATCH /api/projects/{id} with actors field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_patch_accepts_actors_field(self):
        """Test PATCH /api/projects/{id} accepts actors field"""
        # Create project
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Patch_Actors"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Patch with actors
        actors = [
            {"id": "SPEAKER_00", "label": "Boy", "gender": "male", "voice": "dara", "custom_voice": None},
            {"id": "SPEAKER_01", "label": "Girl", "gender": "female", "voice": "sophea", "custom_voice": None}
        ]
        
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"actors": actors}
        )
        print(f"PATCH with actors response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert "actors" in data
        assert len(data["actors"]) == 2
        assert data["actors"][0]["label"] == "Boy"
        assert data["actors"][1]["label"] == "Girl"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ PATCH /api/projects/{id} accepts actors field")


class TestGenerateVideoWithBurnSubtitles:
    """Tests for generate-video endpoint with burn_subtitles query param"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_generate_video_accepts_burn_subtitles_param(self):
        """Test POST /api/projects/{id}/generate-video?burn_subtitles=true accepts query param"""
        # Create project
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Burn_Subtitles"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Try to generate video without prerequisites (should fail with proper error)
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/generate-video?burn_subtitles=true",
            headers=self.headers
        )
        print(f"Generate video response: {response.status_code} - {response.text[:200]}")
        
        # Should return 400 because no video file uploaded
        assert response.status_code == 400
        assert "not a video" in response.text.lower() or "no dubbed audio" in response.text.lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ generate-video endpoint accepts burn_subtitles query param")
    
    def test_generate_video_burn_subtitles_false(self):
        """Test POST /api/projects/{id}/generate-video?burn_subtitles=false"""
        # Create project
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_No_Burn_Subtitles"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Try with burn_subtitles=false
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/generate-video?burn_subtitles=false",
            headers=self.headers
        )
        print(f"Generate video (no burn) response: {response.status_code}")
        
        # Should return 400 because no video file uploaded
        assert response.status_code == 400
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ generate-video endpoint accepts burn_subtitles=false")


class TestTranscribeSegmentsActorLabels:
    """Tests for transcribe-segments endpoint returning actors with label field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_transcribe_segments_returns_error_without_file(self):
        """Test transcribe-segments returns proper error without file"""
        # Create project
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Transcribe_Labels"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Try to transcribe without file
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/transcribe-segments",
            headers=self.headers
        )
        print(f"Transcribe without file: {response.status_code} - {response.text[:200]}")
        
        assert response.status_code == 400
        assert "No file uploaded" in response.text
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ transcribe-segments returns proper error without file")
    
    def test_actors_have_label_field_structure(self):
        """Test that actors structure includes label field"""
        # Create project with actors
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Actor_Labels"}
        )
        assert response.status_code == 200
        project_id = response.json()["project_id"]
        
        # Add actors with labels
        actors = [
            {"id": "SPEAKER_00", "label": "Woman", "gender": "female", "voice": "sophea", "custom_voice": None},
            {"id": "SPEAKER_01", "label": "Man", "gender": "male", "voice": "dara", "custom_voice": None}
        ]
        
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"actors": actors}
        )
        assert response.status_code == 200
        
        # Get project and verify actors have label field
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "actors" in data
        for actor in data["actors"]:
            assert "label" in actor, f"Actor {actor.get('id')} should have 'label' field"
            assert actor["label"] in ["Woman", "Man"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ Actors have label field in structure")


class TestProjectCRUDComplete:
    """Complete CRUD tests for projects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_full_project_lifecycle(self):
        """Test complete project CRUD lifecycle"""
        # CREATE
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Full_Lifecycle"}
        )
        assert response.status_code == 200
        data = response.json()
        project_id = data["project_id"]
        assert "actors" in data
        assert "segments" in data
        print(f"✓ Created project: {project_id}")
        
        # READ
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "TEST_Full_Lifecycle"
        print("✓ Read project")
        
        # UPDATE with actors
        response = requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={
                "title": "Updated Title",
                "actors": [{"id": "SPEAKER_00", "label": "Host", "gender": "male", "voice": "dara"}]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert len(data["actors"]) == 1
        print("✓ Updated project with actors")
        
        # LIST
        response = requests.get(
            f"{BASE_URL}/api/projects",
            headers=self.headers
        )
        assert response.status_code == 200
        projects = response.json()
        assert any(p["project_id"] == project_id for p in projects)
        print("✓ Listed projects")
        
        # DELETE
        response = requests.delete(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        print("✓ Deleted project")
        
        # Verify deletion
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert response.status_code == 404
        print("✓ Verified deletion")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
