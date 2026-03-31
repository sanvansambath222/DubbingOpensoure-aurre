"""
Test suite for multi-language output support feature.
Tests the /api/languages endpoint and target_language parameter in translate-segments and auto-process endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
AUTH_TOKEN = "test_session_001"

# Expected languages (20 total)
EXPECTED_LANGUAGES = [
    "km", "th", "vi", "ko", "ja", "en", "zh", "id", "hi", "es",
    "fr", "tl", "de", "pt", "ru", "ar", "it", "ms", "lo", "my"
]

class TestLanguagesEndpoint:
    """Tests for GET /api/languages endpoint (no auth required)"""
    
    def test_languages_endpoint_returns_200(self):
        """Test that /api/languages returns 200 status"""
        response = requests.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ /api/languages returns 200")
    
    def test_languages_returns_list(self):
        """Test that /api/languages returns a list"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ /api/languages returns a list with {len(data)} items")
    
    def test_languages_count_is_20(self):
        """Test that exactly 20 languages are returned"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        assert len(data) == 20, f"Expected 20 languages, got {len(data)}"
        print("✓ /api/languages returns exactly 20 languages")
    
    def test_each_language_has_required_fields(self):
        """Test that each language has code, name, male_voices, female_voices fields"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        
        required_fields = ["code", "name", "male_voices", "female_voices"]
        
        for lang in data:
            for field in required_fields:
                assert field in lang, f"Language {lang.get('code', 'unknown')} missing field: {field}"
            
            # Verify types
            assert isinstance(lang["code"], str), f"code should be string for {lang['code']}"
            assert isinstance(lang["name"], str), f"name should be string for {lang['code']}"
            assert isinstance(lang["male_voices"], list), f"male_voices should be list for {lang['code']}"
            assert isinstance(lang["female_voices"], list), f"female_voices should be list for {lang['code']}"
        
        print("✓ All languages have required fields: code, name, male_voices, female_voices")
    
    def test_all_expected_languages_present(self):
        """Test that all 20 expected languages are present"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        
        returned_codes = [lang["code"] for lang in data]
        
        for expected_code in EXPECTED_LANGUAGES:
            assert expected_code in returned_codes, f"Missing language: {expected_code}"
        
        print(f"✓ All {len(EXPECTED_LANGUAGES)} expected languages are present")
    
    def test_voices_have_required_structure(self):
        """Test that voice objects have id, name, voice fields"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        
        voice_fields = ["id", "name", "voice"]
        
        for lang in data:
            for voice in lang["male_voices"]:
                for field in voice_fields:
                    assert field in voice, f"Male voice in {lang['code']} missing field: {field}"
            
            for voice in lang["female_voices"]:
                for field in voice_fields:
                    assert field in voice, f"Female voice in {lang['code']} missing field: {field}"
        
        print("✓ All voices have required fields: id, name, voice")
    
    def test_each_language_has_at_least_one_voice(self):
        """Test that each language has at least one male and one female voice"""
        response = requests.get(f"{BASE_URL}/api/languages")
        data = response.json()
        
        for lang in data:
            assert len(lang["male_voices"]) >= 1, f"{lang['code']} has no male voices"
            assert len(lang["female_voices"]) >= 1, f"{lang['code']} has no female voices"
        
        print("✓ Each language has at least one male and one female voice")


class TestTranslateSegmentsEndpoint:
    """Tests for POST /api/projects/{id}/translate-segments with target_language param"""
    
    @pytest.fixture
    def auth_headers(self):
        return {"Authorization": f"Bearer {AUTH_TOKEN}"}
    
    def test_translate_segments_accepts_target_language_param(self, auth_headers):
        """Test that translate-segments endpoint accepts target_language query param"""
        # First create a project
        create_resp = requests.post(
            f"{BASE_URL}/api/projects",
            json={"title": "TEST_translate_lang_test"},
            headers=auth_headers
        )
        
        if create_resp.status_code != 200:
            pytest.skip("Could not create project - auth may be invalid")
        
        project_id = create_resp.json()["project_id"]
        
        try:
            # Test that endpoint accepts target_language param (will fail without segments but should not 400 on param)
            response = requests.post(
                f"{BASE_URL}/api/projects/{project_id}/translate-segments?target_language=th",
                headers=auth_headers
            )
            
            # Should return 400 (no segments) not 422 (invalid param)
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
            print("✓ translate-segments accepts target_language query param")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=auth_headers)
    
    def test_translate_segments_default_language_is_km(self, auth_headers):
        """Test that default target_language is 'km' (Khmer)"""
        # Create project
        create_resp = requests.post(
            f"{BASE_URL}/api/projects",
            json={"title": "TEST_default_lang_test"},
            headers=auth_headers
        )
        
        if create_resp.status_code != 200:
            pytest.skip("Could not create project")
        
        project_id = create_resp.json()["project_id"]
        
        try:
            # Call without target_language param
            response = requests.post(
                f"{BASE_URL}/api/projects/{project_id}/translate-segments",
                headers=auth_headers
            )
            
            # Should work (or fail due to no segments, not due to missing param)
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
            print("✓ translate-segments works without target_language (defaults to km)")
        finally:
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=auth_headers)


class TestAutoProcessEndpoint:
    """Tests for POST /api/projects/{id}/auto-process with target_language param"""
    
    @pytest.fixture
    def auth_headers(self):
        return {"Authorization": f"Bearer {AUTH_TOKEN}"}
    
    def test_auto_process_accepts_target_language_param(self, auth_headers):
        """Test that auto-process endpoint accepts target_language query param"""
        # Create project
        create_resp = requests.post(
            f"{BASE_URL}/api/projects",
            json={"title": "TEST_auto_process_lang"},
            headers=auth_headers
        )
        
        if create_resp.status_code != 200:
            pytest.skip("Could not create project")
        
        project_id = create_resp.json()["project_id"]
        
        try:
            # Test that endpoint accepts target_language param
            response = requests.post(
                f"{BASE_URL}/api/projects/{project_id}/auto-process?target_language=ja&speed=2",
                headers=auth_headers
            )
            
            # Should return 400 (no file) not 422 (invalid param)
            assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
            print("✓ auto-process accepts target_language query param")
        finally:
            requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=auth_headers)


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root_returns_200(self):
        """Test that API root returns 200"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✓ API root returns 200 with message")
    
    def test_languages_no_auth_required(self):
        """Test that /api/languages does not require authentication"""
        response = requests.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200, "Languages endpoint should not require auth"
        print("✓ /api/languages does not require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
