import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

print("🧪 Testing Login Flow...\n")

# Setup headless Chrome
chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.add_argument('--disable-gpu')
chrome_options.add_argument('--no-sandbox')

try:
    driver = webdriver.Chrome(options=chrome_options)
    driver.get('http://localhost:3000/login')
    
    print("✓ Opened login page")
    
    # Wait for username field and fill it
    username = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "username"))
    )
    username.send_keys("superadmin")
    print("✓ Entered username")
    
    # Fill password
    password = driver.find_element(By.ID, "password")
    password.send_keys("superadmin123")
    print("✓ Entered password")
    
    # Click login button
    login_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
    login_btn.click()
    print("✓ Clicked login button")
    
    # Wait for redirect or dashboard
    time.sleep(3)
    
    current_url = driver.current_url
    print(f"\n📍 Current URL: {current_url}")
    
    if '/dashboard' in current_url or '/login' not in current_url:
        print("\n✅ LOGIN TEST PASSED!")
        print("   User successfully logged in and redirected to dashboard")
    else:
        print("\n❌ LOGIN TEST FAILED!")
        print("   User still on login page")
        
except Exception as e:
    print(f"\n❌ Test failed with error: {e}")
finally:
    if 'driver' in locals():
        driver.quit()
