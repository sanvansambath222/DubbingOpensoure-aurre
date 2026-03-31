"""
Backend API Tests for Khmer Dubbing App - Round 1 New Features
Tests:
- GET /api/ returns API message
- GET /api/shared/nonexistent returns 404
- POST /api/projects creates project with share_token and detected_language fields (null by default)
- GET /api/projects lists projects with new fields
- GET /api/projects/{id}/download-srt returns 400 when no segments
- GET /api/projects/{id}/download-mp3 returns 400 when no audio
- POST /api/projects/{id}/share generates share_token and returns it
- DELETE /api/projects/{id}/share removes share token
- GET /api/shared/{token} returns public project info when valid token exists
- GET /api/shared/{token}/video returns 404 when no video
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://khmer-dubbing-hub.preview.emergentagent.com')
TEST_TOKEN = "test_session_001"


class TestHealthCheck:
    """Test API health check endpoint"""
    
    def test_api_root_returns_message(self):
        """GET /api/ returns API message"""
        response = requests.get(f"{BASE_URL}/api/")
        print(f"Health check: {response.status_code} - {response.text}")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Khmer Dubbing API" in data["message"]
        print("✓ GET /api/ returns API message")


class TestSharedEndpointsPublic:
    """Test public shared endpoints (no auth required)"""
    
    def test_shared_nonexistent_returns_404(self):
        """GET /api/shared/nonexistent returns 404"""
        response = requests.get(f"{BASE_URL}/api/shared/nonexistent_token_12345")
        print(f"Shared nonexistent: {response.status_code} - {response.text}")
        assert response.status_code == 404
        assert "not found" in response.text.lower()
        print("✓ GET /api/shared/nonexistent returns 404")
    
    def test_shared_video_nonexistent_returns_404(self):
        """GET /api/shared/{token}/video returns 404 when no video"""
        response = requests.get(f"{BASE_URL}/api/shared/nonexistent_token_12345/video")
        print(f"Shared video nonexistent: {response.status_code}")
        assert response.status_code == 404
        print("✓ GET /api/shared/{token}/video returns 404 when no video")
    
    def test_shared_audio_nonexistent_returns_404(self):
        """GET /api/shared/{token}/audio returns 404 when no audio"""
        response = requests.get(f"{BASE_URL}/api/shared/nonexistent_token_12345/audio")
        print(f"Shared audio nonexistent: {response.status_code}")
        assert response.status_code == 404
        print("✓ GET /api/shared/{token}/audio returns 404 when no audio")
    
    def test_shared_srt_nonexistent_returns_404(self):
        """GET /api/shared/{token}/srt returns 404 when token doesn't exist"""
        response = requests.get(f"{BASE_URL}/api/shared/nonexistent_token_12345/srt")
        print(f"Shared SRT nonexistent: {response.status_code}")
        assert response.status_code == 404
        print("✓ GET /api/shared/{token}/srt returns 404 when token doesn't exist")


class TestProjectCreationWithNewFields:
    """Test project creation includes new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_create_project_has_share_token_field(self):
        """POST /api/projects creates project with share_token field (null by default)"""
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Share_Token_Field"}
        )
        print(f"Create project: {response.status_code} - {response.text[:300]}")
        assert response.status_code == 200
        data = response.json()
        
        # Check share_token field exists and is null by default
        assert "share_token" in data, "Response should contain 'share_token' field"
        assert data["share_token"] is None, "share_token should be null by default"
        
        # Cleanup
        project_id = data["project_id"]
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ POST /api/projects creates project with share_token field (null by default)")
    
    def test_create_project_has_detected_language_field(self):
        """POST /api/projects creates project with detected_language field (null by default)"""
        response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Detected_Language_Field"}
        )
        print(f"Create project: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        
        # Check detected_language field exists and is null by default
        assert "detected_language" in data, "Response should contain 'detected_language' field"
        assert data["detected_language"] is None, "detected_language should be null by default"
        
        # Cleanup
        project_id = data["project_id"]
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ POST /api/projects creates project with detected_language field (null by default)")


class TestProjectListWithNewFields:
    """Test project list includes new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_list_projects_includes_new_fields(self):
        """GET /api/projects lists projects with share_token and detected_language fields"""
        # Create a project first
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_List_New_Fields"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # List projects
        response = requests.get(
            f"{BASE_URL}/api/projects",
            headers=self.headers
        )
        print(f"List projects: {response.status_code}")
        assert response.status_code == 200
        projects = response.json()
        
        # Find our test project
        test_project = next((p for p in projects if p["project_id"] == project_id), None)
        assert test_project is not None, "Test project should be in list"
        
        # Check new fields exist
        assert "share_token" in test_project, "Project should have share_token field"
        assert "detected_language" in test_project, "Project should have detected_language field"
        assert "created_at" in test_project, "Project should have created_at field"
        assert "segments" in test_project, "Project should have segments field"
        assert "actors" in test_project, "Project should have actors field"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/projects lists projects with new fields")


class TestDownloadSRT:
    """Test SRT download endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_download_srt_returns_400_when_no_segments(self):
        """GET /api/projects/{id}/download-srt returns 400 when no segments"""
        # Create project without segments
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Download_SRT_No_Segments"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Try to download SRT
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}/download-srt",
            headers=self.headers
        )
        print(f"Download SRT (no segments): {response.status_code} - {response.text}")
        assert response.status_code == 400
        assert "no segments" in response.text.lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/projects/{id}/download-srt returns 400 when no segments")
    
    def test_download_srt_returns_srt_when_segments_exist(self):
        """GET /api/projects/{id}/download-srt returns SRT file when segments exist"""
        # Create project with segments
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Download_SRT_With_Segments"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Add segments with translated text
        segments = [
            {"id": 0, "start": 0, "end": 3, "original": "Hello", "translated": "សួស្តី", "speaker": "SPEAKER_00"},
            {"id": 1, "start": 3, "end": 6, "original": "World", "translated": "ពិភពលោក", "speaker": "SPEAKER_00"}
        ]
        requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"segments": segments}
        )
        
        # Download SRT
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}/download-srt",
            headers=self.headers
        )
        print(f"Download SRT (with segments): {response.status_code}")
        assert response.status_code == 200
        assert "application/x-subrip" in response.headers.get("Content-Type", "")
        
        # Check SRT content
        srt_content = response.text
        assert "សួស្តី" in srt_content or "1" in srt_content  # Should have subtitle content
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/projects/{id}/download-srt returns SRT file when segments exist")


class TestDownloadMP3:
    """Test MP3 download endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_download_mp3_returns_400_when_no_audio(self):
        """GET /api/projects/{id}/download-mp3 returns 400 when no audio"""
        # Create project without audio
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Download_MP3_No_Audio"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Try to download MP3
        response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}/download-mp3",
            headers=self.headers
        )
        print(f"Download MP3 (no audio): {response.status_code} - {response.text}")
        assert response.status_code == 400
        assert "no dubbed audio" in response.text.lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/projects/{id}/download-mp3 returns 400 when no audio")


class TestShareLinkEndpoints:
    """Test share link creation and removal endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_create_share_link(self):
        """POST /api/projects/{id}/share generates share_token and returns it"""
        # Create project
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Create_Share_Link"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Create share link
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        print(f"Create share link: {response.status_code} - {response.text}")
        assert response.status_code == 200
        data = response.json()
        assert "share_token" in data
        assert data["share_token"] is not None
        assert data["share_token"].startswith("share_")
        
        share_token = data["share_token"]
        
        # Verify share token is saved in project
        get_response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["share_token"] == share_token
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ POST /api/projects/{id}/share generates share_token and returns it")
    
    def test_create_share_link_idempotent(self):
        """POST /api/projects/{id}/share returns same token if already exists"""
        # Create project
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Share_Link_Idempotent"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Create share link first time
        response1 = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        assert response1.status_code == 200
        token1 = response1.json()["share_token"]
        
        # Create share link second time
        response2 = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        assert response2.status_code == 200
        token2 = response2.json()["share_token"]
        
        # Should return same token
        assert token1 == token2
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ POST /api/projects/{id}/share is idempotent")
    
    def test_remove_share_link(self):
        """DELETE /api/projects/{id}/share removes share token"""
        # Create project
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Remove_Share_Link"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Create share link
        share_response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        assert share_response.status_code == 200
        share_token = share_response.json()["share_token"]
        
        # Remove share link
        response = requests.delete(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        print(f"Remove share link: {response.status_code} - {response.text}")
        assert response.status_code == 200
        assert response.json().get("success") == True
        
        # Verify share token is removed
        get_response = requests.get(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["share_token"] is None
        
        # Verify shared endpoint returns 404
        shared_response = requests.get(f"{BASE_URL}/api/shared/{share_token}")
        assert shared_response.status_code == 404
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ DELETE /api/projects/{id}/share removes share token")


class TestSharedProjectAccess:
    """Test public access to shared projects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_get_shared_project_returns_public_info(self):
        """GET /api/shared/{token} returns public project info when valid token exists"""
        # Create project with segments and actors
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Shared_Project_Access"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Add segments and actors
        segments = [
            {"id": 0, "start": 0, "end": 3, "original": "Hello", "translated": "សួស្តី", "speaker": "SPEAKER_00"}
        ]
        actors = [
            {"id": "SPEAKER_00", "label": "Girl", "gender": "female", "voice": "sophea"}
        ]
        requests.patch(
            f"{BASE_URL}/api/projects/{project_id}",
            headers=self.headers,
            json={"segments": segments, "actors": actors}
        )
        
        # Create share link
        share_response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        assert share_response.status_code == 200
        share_token = share_response.json()["share_token"]
        
        # Access shared project (no auth required)
        response = requests.get(f"{BASE_URL}/api/shared/{share_token}")
        print(f"Get shared project: {response.status_code} - {response.text[:500]}")
        assert response.status_code == 200
        data = response.json()
        
        # Check public info is returned
        assert "title" in data
        assert data["title"] == "TEST_Shared_Project_Access"
        assert "status" in data
        assert "detected_language" in data
        assert "file_type" in data
        assert "segments" in data
        assert "actors" in data
        assert "has_video" in data
        assert "has_audio" in data
        assert "created_at" in data
        
        # Check segments and actors are included
        assert len(data["segments"]) == 1
        assert len(data["actors"]) == 1
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/shared/{token} returns public project info when valid token exists")
    
    def test_shared_project_does_not_expose_sensitive_data(self):
        """GET /api/shared/{token} does not expose user_id or project_id"""
        # Create project
        create_response = requests.post(
            f"{BASE_URL}/api/projects",
            headers=self.headers,
            json={"title": "TEST_Shared_No_Sensitive"}
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["project_id"]
        
        # Create share link
        share_response = requests.post(
            f"{BASE_URL}/api/projects/{project_id}/share",
            headers=self.headers
        )
        share_token = share_response.json()["share_token"]
        
        # Access shared project
        response = requests.get(f"{BASE_URL}/api/shared/{share_token}")
        assert response.status_code == 200
        data = response.json()
        
        # Should NOT expose sensitive fields
        assert "user_id" not in data, "user_id should not be exposed"
        assert "project_id" not in data, "project_id should not be exposed"
        assert "original_file_path" not in data, "original_file_path should not be exposed"
        assert "dubbed_audio_path" not in data, "dubbed_audio_path should not be exposed"
        assert "dubbed_video_path" not in data, "dubbed_video_path should not be exposed"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=self.headers)
        print("✓ GET /api/shared/{token} does not expose sensitive data")


class TestProjectNotFound:
    """Test 404 responses for non-existent projects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Authorization": f"Bearer {TEST_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_download_srt_project_not_found(self):
        """GET /api/projects/{id}/download-srt returns 404 for non-existent project"""
        response = requests.get(
            f"{BASE_URL}/api/projects/nonexistent_project_id/download-srt",
            headers=self.headers
        )
        print(f"Download SRT not found: {response.status_code}")
        assert response.status_code == 404
        print("✓ GET /api/projects/{id}/download-srt returns 404 for non-existent project")
    
    def test_download_mp3_project_not_found(self):
        """GET /api/projects/{id}/download-mp3 returns 404 for non-existent project"""
        response = requests.get(
            f"{BASE_URL}/api/projects/nonexistent_project_id/download-mp3",
            headers=self.headers
        )
        print(f"Download MP3 not found: {response.status_code}")
        assert response.status_code == 404
        print("✓ GET /api/projects/{id}/download-mp3 returns 404 for non-existent project")
    
    def test_share_project_not_found(self):
        """POST /api/projects/{id}/share returns 404 for non-existent project"""
        response = requests.post(
            f"{BASE_URL}/api/projects/nonexistent_project_id/share",
            headers=self.headers
        )
        print(f"Share not found: {response.status_code}")
        assert response.status_code == 404
        print("✓ POST /api/projects/{id}/share returns 404 for non-existent project")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
