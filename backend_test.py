#!/usr/bin/env python3
"""
Backend API Testing for Khmer Dubbing App
Tests all API endpoints with authentication
"""

import requests
import sys
import json
from datetime import datetime

class KhmerDubbingAPITester:
    def __init__(self, base_url="https://khmer-dubbing-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = "test_session_001"  # Provided test token
        self.user_id = "test-user-001"  # Provided test user
        self.tests_run = 0
        self.tests_passed = 0
        self.project_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        test_headers = {'Content-Type': 'application/json'}
        
        # Add auth header
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        # Add custom headers
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        print(f"   Method: {method}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        return self.run_test(
            "Auth Me Endpoint",
            "GET", 
            "auth/me",
            200
        )

    def test_create_project(self):
        """Test creating a new project"""
        success, response = self.run_test(
            "Create Project",
            "POST",
            "projects",
            200,
            data={"title": "Test Dubbing Project"}
        )
        if success and 'project_id' in response:
            self.project_id = response['project_id']
            print(f"   Created project ID: {self.project_id}")
        return success, response

    def test_list_projects(self):
        """Test listing projects"""
        return self.run_test(
            "List Projects",
            "GET",
            "projects", 
            200
        )

    def test_get_project(self):
        """Test getting a specific project"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False, {}
        
        return self.run_test(
            "Get Project",
            "GET",
            f"projects/{self.project_id}",
            200
        )

    def test_update_project(self):
        """Test updating a project"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False, {}
            
        return self.run_test(
            "Update Project",
            "PATCH",
            f"projects/{self.project_id}",
            200,
            data={"title": "Updated Test Project", "original_text": "测试中文文本"}
        )

    def test_quick_translate(self):
        """Test quick translate endpoint"""
        return self.run_test(
            "Quick Translate",
            "POST",
            "translate",
            200,
            data={"chinese_text": "你好世界"}
        )

    def test_logout(self):
        """Test logout endpoint"""
        return self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200
        )

def main():
    print("🚀 Starting Khmer Dubbing API Tests")
    print("=" * 50)
    
    tester = KhmerDubbingAPITester()
    
    # Test sequence
    tests = [
        ("Root API", tester.test_root_endpoint),
        ("Auth Me", tester.test_auth_me),
        ("Create Project", tester.test_create_project),
        ("List Projects", tester.test_list_projects),
        ("Get Project", tester.test_get_project),
        ("Update Project", tester.test_update_project),
        ("Quick Translate", tester.test_quick_translate),
        ("Logout", tester.test_logout),
    ]
    
    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            tester.tests_run += 1

    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())