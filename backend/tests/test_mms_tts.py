"""
Test Meta MMS TTS Integration for Khmer Voice
Tests the facebook/mms-tts-khm model integration for Khmer text-to-speech
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMMSTTS:
    """Meta MMS TTS endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for authenticated requests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        self.token = data.get("session_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
    def test_api_root(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert "VoxiDub" in response.json().get("message", "")
        print("✓ API root accessible")
    
    def test_login_success(self):
        """Test login with test credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@voxidub.com",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@voxidub.com"
        print("✓ Login successful with test@voxidub.com")
    
    def test_mms_project_exists(self):
        """Test that the MMS test project exists"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_1154fafbf78d")
        assert response.status_code == 200, f"Project not found: {response.text}"
        project = response.json()
        assert project["project_id"] == "proj_1154fafbf78d"
        assert project.get("target_language") == "km"
        print(f"✓ MMS test project exists: {project.get('title')}")
        
    def test_mms_project_has_segments(self):
        """Test that project has 2 segments with Khmer translations"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_1154fafbf78d")
        assert response.status_code == 200
        project = response.json()
        segments = project.get("segments", [])
        assert len(segments) == 2, f"Expected 2 segments, got {len(segments)}"
        
        # Check segment 0
        seg0 = segments[0]
        assert seg0.get("translated"), "Segment 0 missing translation"
        assert "សួស្តី" in seg0.get("translated", ""), "Segment 0 should have Khmer text"
        
        # Check segment 1
        seg1 = segments[1]
        assert seg1.get("translated"), "Segment 1 missing translation"
        assert "ខ្ញុំ" in seg1.get("translated", ""), "Segment 1 should have Khmer text"
        
        print(f"✓ Project has 2 segments with Khmer translations")
        print(f"  Segment 0: {seg0.get('translated')}")
        print(f"  Segment 1: {seg1.get('translated')}")
        
    def test_mms_project_has_mms_voice(self):
        """Test that project actor has MMS voice configured"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_1154fafbf78d")
        assert response.status_code == 200
        project = response.json()
        actors = project.get("actors", [])
        assert len(actors) >= 1, "Project should have at least 1 actor"
        
        actor = actors[0]
        assert actor.get("voice") == "mms_khmer", f"Actor voice should be mms_khmer, got {actor.get('voice')}"
        print(f"✓ Actor has MMS voice: {actor.get('voice')}")
        
    def test_regenerate_segment_0_mms(self):
        """Test regenerating segment 0 with MMS TTS - should return 200 with audio"""
        response = self.session.post(
            f"{BASE_URL}/api/projects/proj_1154fafbf78d/regenerate-segment/0?speed=0",
            timeout=60  # MMS model may take time on first load
        )
        assert response.status_code == 200, f"Regenerate segment 0 failed: {response.status_code} - {response.text[:200]}"
        
        # Check response is audio data
        content_type = response.headers.get("content-type", "")
        assert "audio" in content_type or len(response.content) > 1000, \
            f"Expected audio response, got content-type: {content_type}, size: {len(response.content)}"
        
        print(f"✓ Regenerate segment 0 returned 200 with {len(response.content)} bytes audio")
        
    def test_regenerate_segment_1_mms(self):
        """Test regenerating segment 1 with MMS TTS - should return 200 with audio"""
        response = self.session.post(
            f"{BASE_URL}/api/projects/proj_1154fafbf78d/regenerate-segment/1?speed=0",
            timeout=60
        )
        assert response.status_code == 200, f"Regenerate segment 1 failed: {response.status_code} - {response.text[:200]}"
        
        # Check response is audio data
        content_type = response.headers.get("content-type", "")
        assert "audio" in content_type or len(response.content) > 1000, \
            f"Expected audio response, got content-type: {content_type}, size: {len(response.content)}"
        
        print(f"✓ Regenerate segment 1 returned 200 with {len(response.content)} bytes audio")
        
    def test_regenerate_invalid_segment(self):
        """Test regenerating invalid segment index returns 400"""
        response = self.session.post(
            f"{BASE_URL}/api/projects/proj_1154fafbf78d/regenerate-segment/99?speed=0"
        )
        assert response.status_code == 400, f"Expected 400 for invalid segment, got {response.status_code}"
        print("✓ Invalid segment index returns 400")
        
    def test_regenerate_requires_auth(self):
        """Test regenerate endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/projects/proj_1154fafbf78d/regenerate-segment/0?speed=0"
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ Regenerate endpoint requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
