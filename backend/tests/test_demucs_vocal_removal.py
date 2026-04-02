"""
Test suite for VoxiDub Demucs AI Vocal Removal Feature
Tests the extract_background_audio endpoint and related functionality
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@voxidub.com"
TEST_PASSWORD = "test123"
TEST_PROJECT_ID = "proj_e7169160ad1f"  # Project with uploaded video


class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "No session_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful, token: {data['session_token'][:20]}...")
        return data["session_token"]


class TestExtractBackgroundAudio:
    """Tests for Demucs AI vocal removal feature"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Authentication failed")
    
    def test_project_exists(self, auth_token):
        """Verify test project exists and has video file"""
        response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Project not found: {response.text}"
        data = response.json()
        assert data.get("file_type") == "video", "Project is not a video"
        assert data.get("original_file_path"), "No video file uploaded"
        print(f"✓ Project '{data.get('title')}' exists with video file")
    
    def test_extract_background_endpoint_returns_200(self, auth_token):
        """Test POST /api/projects/{project_id}/extract-background returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/extract-background",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=300  # Demucs can take a while
        )
        assert response.status_code == 200, f"Extract background failed: {response.status_code}"
        print(f"✓ Extract background returned 200")
    
    def test_extract_background_returns_wav_audio(self, auth_token):
        """Test that extract-background returns WAV audio data"""
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/extract-background",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=300
        )
        assert response.status_code == 200
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "audio/wav" in content_type, f"Expected audio/wav, got {content_type}"
        
        # Check content length
        content_length = len(response.content)
        assert content_length > 10000, f"Audio too small: {content_length} bytes"
        
        # Check WAV header (RIFF)
        assert response.content[:4] == b'RIFF', "Not a valid WAV file (missing RIFF header)"
        
        print(f"✓ Received {content_length} bytes of WAV audio")
    
    def test_extract_background_requires_auth(self):
        """Test that extract-background requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/extract-background"
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Endpoint requires authentication")
    
    def test_extract_background_invalid_project(self, auth_token):
        """Test extract-background with invalid project ID"""
        response = requests.post(
            f"{BASE_URL}/api/projects/invalid_project_id/extract-background",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Returns 404 for invalid project")


class TestDownloadButtons:
    """Tests for download functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Authentication failed")
    
    def test_download_srt_endpoint(self, auth_token):
        """Test SRT download endpoint exists"""
        # First need a project with segments
        response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/download-srt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # May return 400 if no segments, but endpoint should exist
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print(f"✓ SRT download endpoint exists (status: {response.status_code})")
    
    def test_download_mp3_endpoint(self, auth_token):
        """Test MP3 download endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/download-mp3",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=60
        )
        # May return 400 if no audio, but endpoint should exist
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print(f"✓ MP3 download endpoint exists (status: {response.status_code})")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "VoxiDub API"
        print("✓ API root endpoint working")
    
    def test_projects_list_requires_auth(self):
        """Test that projects list requires authentication"""
        response = requests.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 401
        print("✓ Projects endpoint requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
