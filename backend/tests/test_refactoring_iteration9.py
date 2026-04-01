"""
Test suite for code refactoring verification - Iteration 9
Tests all API endpoints and verifies the refactored code works correctly.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://khmer-dubbing-hub.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"
TEST_TOKEN = "test_session_001"

@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}

@pytest.fixture
def auth_headers_no_content():
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


class TestHealthAndAuth:
    """Test basic API health and authentication"""
    
    def test_api_root_returns_200(self):
        """API root endpoint should return 200"""
        response = requests.get(f"{API_URL}/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"SUCCESS: API root returns: {data}")
    
    def test_auth_me_with_valid_token(self, auth_headers):
        """GET /api/auth/me should return user data with valid token"""
        response = requests.get(f"{API_URL}/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        print(f"SUCCESS: Auth returns user: {data['email']}")
    
    def test_auth_me_without_token(self):
        """GET /api/auth/me should return 401 without token"""
        response = requests.get(f"{API_URL}/auth/me")
        assert response.status_code == 401
        print("SUCCESS: Auth correctly rejects unauthenticated request")


class TestProjectCRUD:
    """Test project CRUD operations"""
    
    def test_create_project(self, auth_headers):
        """POST /api/projects should create a new project"""
        response = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Refactoring_Project"},
            headers=auth_headers
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert "project_id" in data
        assert data["title"] == "TEST_Refactoring_Project"
        print(f"SUCCESS: Created project: {data['project_id']}")
        return data["project_id"]
    
    def test_list_projects(self, auth_headers):
        """GET /api/projects should return list of projects"""
        response = requests.get(f"{API_URL}/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Listed {len(data)} projects")
    
    def test_get_project_detail(self, auth_headers):
        """GET /api/projects/{id} should return project details"""
        # First create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Detail_Project"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Then get its details
        response = requests.get(f"{API_URL}/projects/{project_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == project_id
        assert data["title"] == "TEST_Detail_Project"
        print(f"SUCCESS: Got project detail for {project_id}")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_update_project(self, auth_headers):
        """PATCH /api/projects/{id} should update project"""
        # Create project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Update_Project"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Update it
        response = requests.patch(
            f"{API_URL}/projects/{project_id}",
            json={"title": "TEST_Updated_Title"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "TEST_Updated_Title"
        print(f"SUCCESS: Updated project {project_id}")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_delete_single_project(self, auth_headers):
        """DELETE /api/projects/{id} should delete a single project"""
        # Create project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Delete_Single"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Delete it
        response = requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print(f"SUCCESS: Deleted project {project_id}")
        
        # Verify it's gone
        get_resp = requests.get(f"{API_URL}/projects/{project_id}", headers=auth_headers)
        assert get_resp.status_code == 404
        print("SUCCESS: Verified project is deleted")
    
    def test_delete_all_projects(self, auth_headers):
        """DELETE /api/projects should delete all user projects"""
        # Create a few test projects
        for i in range(2):
            requests.post(
                f"{API_URL}/projects",
                json={"title": f"TEST_ClearAll_{i}"},
                headers=auth_headers
            )
        
        # Delete all
        response = requests.delete(f"{API_URL}/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "deleted" in data
        print(f"SUCCESS: Cleared {data['deleted']} projects")
        
        # Verify list is empty
        list_resp = requests.get(f"{API_URL}/projects", headers=auth_headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 0
        print("SUCCESS: Verified all projects cleared")


class TestQueueStatus:
    """Test queue status endpoint for progress tracking"""
    
    def test_queue_status_endpoint_exists(self, auth_headers):
        """GET /api/projects/{id}/queue-status should exist"""
        # Create a project first
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_QueueStatus"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        response = requests.get(f"{API_URL}/projects/{project_id}/queue-status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Should have progress fields
        assert "progress" in data or "status" in data
        print(f"SUCCESS: Queue status endpoint works: {data}")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_queue_status_requires_auth(self):
        """Queue status should require authentication"""
        response = requests.get(f"{API_URL}/projects/fake_id/queue-status")
        assert response.status_code == 401
        print("SUCCESS: Queue status requires auth")


class TestYouTubeVoice:
    """Test YouTube voice extraction endpoint"""
    
    def test_youtube_voice_endpoint_exists(self, auth_headers):
        """POST /api/projects/{id}/youtube-voice should exist"""
        # Create a project first
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_YouTubeVoice"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Test with invalid URL (should return error, not 404)
        response = requests.post(
            f"{API_URL}/projects/{project_id}/youtube-voice",
            json={"url": "invalid_url", "actor_id": ""},
            headers=auth_headers
        )
        # Should not be 404 (endpoint exists)
        assert response.status_code != 404
        print(f"SUCCESS: YouTube voice endpoint exists (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_youtube_voice_requires_auth(self):
        """YouTube voice should require authentication"""
        response = requests.post(
            f"{API_URL}/projects/fake_id/youtube-voice",
            json={"url": "https://youtube.com/watch?v=test", "actor_id": ""}
        )
        assert response.status_code == 401
        print("SUCCESS: YouTube voice requires auth")


class TestProjectDuplicate:
    """Test project duplication"""
    
    def test_duplicate_project(self, auth_headers):
        """POST /api/projects/{id}/duplicate should duplicate a project"""
        # Create original project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Original"},
            headers=auth_headers
        )
        original_id = create_resp.json()["project_id"]
        
        # Duplicate it
        response = requests.post(
            f"{API_URL}/projects/{original_id}/duplicate",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] != original_id
        assert "Copy" in data["title"]
        print(f"SUCCESS: Duplicated project to {data['project_id']}")
        
        # Cleanup both
        requests.delete(f"{API_URL}/projects/{original_id}", headers=auth_headers)
        requests.delete(f"{API_URL}/projects/{data['project_id']}", headers=auth_headers)


class TestSegmentOperations:
    """Test segment merge and split operations"""
    
    def test_merge_segments_endpoint_exists(self, auth_headers):
        """POST /api/projects/{id}/merge-segments should exist"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_MergeSegments"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Try to merge (will fail with no segments, but endpoint should exist)
        response = requests.post(
            f"{API_URL}/projects/{project_id}/merge-segments",
            json={"segment_ids": [0, 1]},
            headers=auth_headers
        )
        # Should not be 404
        assert response.status_code != 404
        print(f"SUCCESS: Merge segments endpoint exists (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_split_segment_endpoint_exists(self, auth_headers):
        """POST /api/projects/{id}/split-segment should exist"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_SplitSegment"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Try to split (will fail with no segments, but endpoint should exist)
        response = requests.post(
            f"{API_URL}/projects/{project_id}/split-segment",
            json={"segment_id": 0},
            headers=auth_headers
        )
        # Should not be 404
        assert response.status_code != 404
        print(f"SUCCESS: Split segment endpoint exists (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)


class TestShareFeature:
    """Test project sharing functionality"""
    
    def test_create_share_link(self, auth_headers):
        """POST /api/projects/{id}/share should create share link"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_ShareProject"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Create share link
        response = requests.post(
            f"{API_URL}/projects/{project_id}/share",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "share_token" in data
        print(f"SUCCESS: Created share token: {data['share_token']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_delete_share_link(self, auth_headers):
        """DELETE /api/projects/{id}/share should remove share link"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_DeleteShare"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Create share link first
        requests.post(f"{API_URL}/projects/{project_id}/share", headers=auth_headers)
        
        # Delete share link
        response = requests.delete(
            f"{API_URL}/projects/{project_id}/share",
            headers=auth_headers
        )
        assert response.status_code == 200
        print("SUCCESS: Deleted share link")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)


class TestDownloadEndpoints:
    """Test download endpoints exist"""
    
    def test_download_srt_endpoint_exists(self, auth_headers):
        """GET /api/projects/{id}/download-srt should exist"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_DownloadSRT"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        response = requests.get(
            f"{API_URL}/projects/{project_id}/download-srt",
            headers=auth_headers
        )
        # Should not be 404 (endpoint exists, may return 400 if no segments)
        assert response.status_code != 404
        print(f"SUCCESS: Download SRT endpoint exists (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)
    
    def test_download_mp3_endpoint_exists(self, auth_headers):
        """GET /api/projects/{id}/download-mp3 should exist"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_DownloadMP3"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        response = requests.get(
            f"{API_URL}/projects/{project_id}/download-mp3",
            headers=auth_headers
        )
        # Should not be 404 (endpoint exists, may return 400 if no audio)
        assert response.status_code != 404
        print(f"SUCCESS: Download MP3 endpoint exists (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)


class TestTranslateEndpoint:
    """Test translation endpoint"""
    
    def test_translate_segments_accepts_target_language(self, auth_headers):
        """POST /api/projects/{id}/translate-segments should accept target_language param"""
        # Create a project
        create_resp = requests.post(
            f"{API_URL}/projects",
            json={"title": "TEST_Translate"},
            headers=auth_headers
        )
        project_id = create_resp.json()["project_id"]
        
        # Try to translate (will fail with no segments, but should accept param)
        response = requests.post(
            f"{API_URL}/projects/{project_id}/translate-segments?target_language=th",
            headers=auth_headers
        )
        # Should not be 404
        assert response.status_code != 404
        print(f"SUCCESS: Translate endpoint accepts target_language (status: {response.status_code})")
        
        # Cleanup
        requests.delete(f"{API_URL}/projects/{project_id}", headers=auth_headers)


class TestCleanup:
    """Cleanup any remaining test data"""
    
    def test_cleanup_test_projects(self, auth_headers):
        """Clean up any TEST_ prefixed projects"""
        response = requests.get(f"{API_URL}/projects", headers=auth_headers)
        if response.status_code == 200:
            projects = response.json()
            deleted = 0
            for p in projects:
                if p.get("title", "").startswith("TEST_"):
                    requests.delete(f"{API_URL}/projects/{p['project_id']}", headers=auth_headers)
                    deleted += 1
            print(f"Cleaned up {deleted} test projects")
        print("SUCCESS: Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
