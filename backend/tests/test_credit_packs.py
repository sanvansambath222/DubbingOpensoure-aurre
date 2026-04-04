"""
Test suite for VoxiDub.AI Credit Pack System
Tests: GET /subscription/plans, GET /subscription/me, POST /subscription/use-credit, POST /subscription/buy-credits
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@voxidub.com"
TEST_PASSWORD = "test123"


class TestSubscriptionPlansAPI:
    """Test GET /api/subscription/plans - returns both plans AND credit_packs arrays"""
    
    def test_plans_endpoint_returns_200(self):
        """Plans endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/subscription/plans returns 200")
    
    def test_plans_response_has_plans_array(self):
        """Response should have 'plans' array"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert "plans" in data, "Response missing 'plans' key"
        assert isinstance(data["plans"], list), "'plans' should be a list"
        print(f"PASS: Response has 'plans' array with {len(data['plans'])} plans")
    
    def test_plans_response_has_credit_packs_array(self):
        """Response should have 'credit_packs' array"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert "credit_packs" in data, "Response missing 'credit_packs' key"
        assert isinstance(data["credit_packs"], list), "'credit_packs' should be a list"
        print(f"PASS: Response has 'credit_packs' array with {len(data['credit_packs'])} packs")
    
    def test_four_monthly_plans_exist(self):
        """Should have 4 monthly plans: free, basic, pro, business"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plans = data["plans"]
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}"
        plan_ids = [p["id"] for p in plans]
        assert "free" in plan_ids, "Missing 'free' plan"
        assert "basic" in plan_ids, "Missing 'basic' plan"
        assert "pro" in plan_ids, "Missing 'pro' plan"
        assert "business" in plan_ids, "Missing 'business' plan"
        print(f"PASS: 4 monthly plans exist: {plan_ids}")
    
    def test_four_credit_packs_exist(self):
        """Should have 4 credit packs: pack_5, pack_20, pack_50, pack_100"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        packs = data["credit_packs"]
        assert len(packs) == 4, f"Expected 4 credit packs, got {len(packs)}"
        pack_ids = [p["id"] for p in packs]
        assert "pack_5" in pack_ids, "Missing 'pack_5'"
        assert "pack_20" in pack_ids, "Missing 'pack_20'"
        assert "pack_50" in pack_ids, "Missing 'pack_50'"
        assert "pack_100" in pack_ids, "Missing 'pack_100'"
        print(f"PASS: 4 credit packs exist: {pack_ids}")
    
    def test_monthly_plan_prices_usd(self):
        """Monthly plans should have correct USD prices: Free/$0, Basic/$5, Pro/$15, Business/$39"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plans = {p["id"]: p for p in data["plans"]}
        
        assert plans["free"]["price_usd"] == 0, f"Free plan should be $0, got ${plans['free']['price_usd']}"
        assert plans["basic"]["price_usd"] == 5, f"Basic plan should be $5, got ${plans['basic']['price_usd']}"
        assert plans["pro"]["price_usd"] == 15, f"Pro plan should be $15, got ${plans['pro']['price_usd']}"
        assert plans["business"]["price_usd"] == 39, f"Business plan should be $39, got ${plans['business']['price_usd']}"
        print("PASS: Monthly plan USD prices correct: Free/$0, Basic/$5, Pro/$15, Business/$39")
    
    def test_monthly_plan_prices_khr(self):
        """Monthly plans should have correct KHR prices: 0/20000/60000/156000"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plans = {p["id"]: p for p in data["plans"]}
        
        assert plans["free"]["price_khr"] == 0, f"Free plan KHR should be 0, got {plans['free']['price_khr']}"
        assert plans["basic"]["price_khr"] == 20000, f"Basic plan KHR should be 20000, got {plans['basic']['price_khr']}"
        assert plans["pro"]["price_khr"] == 60000, f"Pro plan KHR should be 60000, got {plans['pro']['price_khr']}"
        assert plans["business"]["price_khr"] == 156000, f"Business plan KHR should be 156000, got {plans['business']['price_khr']}"
        print("PASS: Monthly plan KHR prices correct: 0/20000/60000/156000")
    
    def test_credit_pack_prices_usd(self):
        """Credit packs should have correct USD prices: 5/$3, 20/$10, 50/$20, 100/$35"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        packs = {p["id"]: p for p in data["credit_packs"]}
        
        assert packs["pack_5"]["price_usd"] == 3, f"pack_5 should be $3, got ${packs['pack_5']['price_usd']}"
        assert packs["pack_20"]["price_usd"] == 10, f"pack_20 should be $10, got ${packs['pack_20']['price_usd']}"
        assert packs["pack_50"]["price_usd"] == 20, f"pack_50 should be $20, got ${packs['pack_50']['price_usd']}"
        assert packs["pack_100"]["price_usd"] == 35, f"pack_100 should be $35, got ${packs['pack_100']['price_usd']}"
        print("PASS: Credit pack USD prices correct: 5/$3, 20/$10, 50/$20, 100/$35")
    
    def test_credit_pack_credits_count(self):
        """Credit packs should have correct credit counts: 5, 20, 50, 100"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        packs = {p["id"]: p for p in data["credit_packs"]}
        
        assert packs["pack_5"]["credits"] == 5, f"pack_5 should have 5 credits, got {packs['pack_5']['credits']}"
        assert packs["pack_20"]["credits"] == 20, f"pack_20 should have 20 credits, got {packs['pack_20']['credits']}"
        assert packs["pack_50"]["credits"] == 50, f"pack_50 should have 50 credits, got {packs['pack_50']['credits']}"
        assert packs["pack_100"]["credits"] == 100, f"pack_100 should have 100 credits, got {packs['pack_100']['credits']}"
        print("PASS: Credit pack credit counts correct: 5, 20, 50, 100")


class TestSubscriptionMeAPI:
    """Test GET /api/subscription/me - returns subscription with credits_remaining field"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token by logging in"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code} - {response.text}")
        return response.json().get("session_token")
    
    def test_subscription_me_requires_auth(self):
        """GET /subscription/me should return 401 without auth"""
        response = requests.get(f"{BASE_URL}/api/subscription/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: GET /api/subscription/me returns 401 without auth")
    
    def test_subscription_me_returns_subscription(self, auth_token):
        """GET /subscription/me should return subscription object"""
        response = requests.get(f"{BASE_URL}/api/subscription/me", 
                               headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "subscription" in data, "Response missing 'subscription' key"
        print("PASS: GET /api/subscription/me returns subscription object")
    
    def test_subscription_has_credits_remaining_field(self, auth_token):
        """Subscription should have credits_remaining field"""
        response = requests.get(f"{BASE_URL}/api/subscription/me", 
                               headers={"Authorization": f"Bearer {auth_token}"})
        data = response.json()
        sub = data.get("subscription", {})
        assert "credits_remaining" in sub, "Subscription missing 'credits_remaining' field"
        print(f"PASS: Subscription has credits_remaining field: {sub['credits_remaining']}")
    
    def test_subscription_has_plan_info(self, auth_token):
        """Response should include plan_info"""
        response = requests.get(f"{BASE_URL}/api/subscription/me", 
                               headers={"Authorization": f"Bearer {auth_token}"})
        data = response.json()
        assert "plan_info" in data, "Response missing 'plan_info' key"
        print(f"PASS: Response includes plan_info")
    
    def test_subscription_has_can_dub_field(self, auth_token):
        """Response should include can_dub boolean"""
        response = requests.get(f"{BASE_URL}/api/subscription/me", 
                               headers={"Authorization": f"Bearer {auth_token}"})
        data = response.json()
        assert "can_dub" in data, "Response missing 'can_dub' key"
        assert isinstance(data["can_dub"], bool), "'can_dub' should be boolean"
        print(f"PASS: Response includes can_dub: {data['can_dub']}")


class TestUseCreditAPI:
    """Test POST /api/subscription/use-credit - works for credit pack users"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token by logging in"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code} - {response.text}")
        return response.json().get("session_token")
    
    def test_use_credit_requires_auth(self):
        """POST /subscription/use-credit should return 401 without auth"""
        response = requests.post(f"{BASE_URL}/api/subscription/use-credit")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: POST /api/subscription/use-credit returns 401 without auth")
    
    def test_use_credit_endpoint_exists(self, auth_token):
        """POST /subscription/use-credit endpoint should exist and respond"""
        response = requests.post(f"{BASE_URL}/api/subscription/use-credit",
                                headers={"Authorization": f"Bearer {auth_token}"})
        # Should return 200 (success) or 403 (no credits) - not 404
        assert response.status_code in [200, 403], f"Expected 200 or 403, got {response.status_code}"
        print(f"PASS: POST /api/subscription/use-credit endpoint exists (status: {response.status_code})")


class TestBuyCreditsAPI:
    """Test POST /api/subscription/buy-credits - endpoint exists and validates pack IDs"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token by logging in"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code} - {response.text}")
        return response.json().get("session_token")
    
    def test_buy_credits_requires_auth(self):
        """POST /subscription/buy-credits should return 401 without auth"""
        response = requests.post(f"{BASE_URL}/api/subscription/buy-credits", json={"pack": "pack_5"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: POST /api/subscription/buy-credits returns 401 without auth")
    
    def test_buy_credits_endpoint_exists(self, auth_token):
        """POST /subscription/buy-credits endpoint should exist"""
        response = requests.post(f"{BASE_URL}/api/subscription/buy-credits",
                                headers={"Authorization": f"Bearer {auth_token}"},
                                json={"pack": "pack_5"})
        # Should return 200 (success) - not 404
        assert response.status_code != 404, f"Endpoint not found (404)"
        print(f"PASS: POST /api/subscription/buy-credits endpoint exists (status: {response.status_code})")
    
    def test_buy_credits_validates_invalid_pack(self, auth_token):
        """POST /subscription/buy-credits should return 400 for invalid pack ID"""
        response = requests.post(f"{BASE_URL}/api/subscription/buy-credits",
                                headers={"Authorization": f"Bearer {auth_token}"},
                                json={"pack": "invalid_pack_xyz"})
        assert response.status_code == 400, f"Expected 400 for invalid pack, got {response.status_code}"
        print("PASS: POST /api/subscription/buy-credits returns 400 for invalid pack ID")
    
    def test_buy_credits_accepts_valid_pack_ids(self, auth_token):
        """POST /subscription/buy-credits should accept valid pack IDs"""
        valid_packs = ["pack_5", "pack_20", "pack_50", "pack_100"]
        for pack_id in valid_packs:
            response = requests.post(f"{BASE_URL}/api/subscription/buy-credits",
                                    headers={"Authorization": f"Bearer {auth_token}"},
                                    json={"pack": pack_id})
            # Should return 200 (success) - not 400 (invalid pack)
            assert response.status_code == 200, f"Pack {pack_id} should be valid, got {response.status_code}"
        print(f"PASS: All valid pack IDs accepted: {valid_packs}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
