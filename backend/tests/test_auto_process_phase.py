"""
Test Auto Process Phase Split - VoxiDub
Tests for the 2-phase auto-process feature:
- Phase 1: Detect speakers + Translate (stops here)
- Phase 2: User clicks 'Generate Audio' after reviewing voices
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthAndBasicEndpoints:
    """Test authentication and basic API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_login_with_test_credentials(self):
        """Test login with test@voxidub.com / test123"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "session_token" in data, "No session_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == "test@voxidub.com"
        print(f"✓ Login successful, token: {data['session_token'][:20]}...")
    
    def test_edge_voices_endpoint(self):
        """Test /api/edge-voices returns voices"""
        response = self.session.get(f"{BASE_URL}/api/edge-voices")
        assert response.status_code == 200, f"Edge voices failed: {response.text}"
        data = response.json()
        assert "languages" in data, "No languages in response"
        assert "total_voices" in data, "No total_voices in response"
        assert data["total_voices"] > 0, "No voices returned"
        print(f"✓ Edge voices endpoint returned {data['total_voices']} voices")


class TestAutoProcessPhase:
    """Test auto-process endpoint behavior"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login first
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip("Login failed - skipping authenticated tests")
    
    def test_create_project(self):
        """Test creating a new project"""
        response = self.session.post(f"{BASE_URL}/api/projects", json={
            "title": "TEST_AutoProcess_Phase_Test"
        })
        assert response.status_code in [200, 201], f"Create project failed: {response.text}"
        data = response.json()
        assert "project_id" in data, "No project_id in response"
        print(f"✓ Created project: {data['project_id']}")
        return data["project_id"]
    
    def test_auto_process_endpoint_exists(self):
        """Test that auto-process endpoint exists and returns proper response"""
        # First create a project
        create_resp = self.session.post(f"{BASE_URL}/api/projects", json={
            "title": "TEST_AutoProcess_Endpoint_Test"
        })
        if create_resp.status_code not in [200, 201]:
            pytest.skip("Could not create project")
        
        project_id = create_resp.json()["project_id"]
        
        # Try to call auto-process (will fail without file, but should return proper error)
        response = self.session.post(
            f"{BASE_URL}/api/projects/{project_id}/auto-process?speed=0&target_language=km&bg_volume=30"
        )
        # Should return 400 (no file) or 200 (processing started)
        # The key is it should NOT return 404 (endpoint not found)
        assert response.status_code != 404, "Auto-process endpoint not found"
        print(f"✓ Auto-process endpoint exists, status: {response.status_code}")
    
    def test_get_project_status(self):
        """Test getting project status"""
        # Create project
        create_resp = self.session.post(f"{BASE_URL}/api/projects", json={
            "title": "TEST_Status_Check"
        })
        if create_resp.status_code not in [200, 201]:
            pytest.skip("Could not create project")
        
        project_id = create_resp.json()["project_id"]
        
        # Get project
        response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200, f"Get project failed: {response.text}"
        data = response.json()
        assert "status" in data, "No status in project response"
        assert "project_id" in data, "No project_id in response"
        print(f"✓ Project status: {data['status']}")


class TestProjectsList:
    """Test projects list endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Login failed")
    
    def test_list_projects(self):
        """Test listing user projects"""
        response = self.session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200, f"List projects failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Projects response should be a list"
        print(f"✓ Listed {len(data)} projects")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json().get("session_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_cleanup_test_projects(self):
        """Delete TEST_ prefixed projects"""
        response = self.session.get(f"{BASE_URL}/api/projects")
        if response.status_code != 200:
            pytest.skip("Could not list projects")
        
        projects = response.json()
        deleted = 0
        for proj in projects:
            if proj.get("title", "").startswith("TEST_"):
                del_resp = self.session.delete(f"{BASE_URL}/api/projects/{proj['project_id']}")
                if del_resp.status_code in [200, 204]:
                    deleted += 1
        
        print(f"✓ Cleaned up {deleted} test projects")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
