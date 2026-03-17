from flask import Flask, request, jsonify, render_template
import json
import os
import tempfile
import requests
import subprocess
import re
import hashlib
from google import genai

app = Flask(__name__)

CONFIG_PATH = "gemini_config.json"
CACHE_FILE = 'leetcode_cache.json'

safe_code_hashes = set()


# ---------------- SAFETY LAYER ----------------
def static_code_check(code):
    patterns = [
        r"\bos\b",
        r"\bsubprocess\b",
        r"\beval\b",
        r"\bexec\b",
        r"\bopen\s*\(",
        r"\b__import__\b",
        r"while\s+True",
        r"for\s+.*range\s*\(\s*10\*\*",
    ]

    for p in patterns:
        if re.search(p, code):
            return False, f"Blocked pattern: {p}"

    return True, "OK"


def ai_code_check(code):
    try:
        with open(CONFIG_PATH, 'r') as f:
            config = json.load(f)

        client = genai.Client(api_key=config['api_key'])

        prompt = f"""
        You are a strict code safety filter.

        Decide if this code is SAFE to execute.
        Unsafe if:
        - file access
        - OS/system calls
        - network calls
        - infinite loops
        - abuse patterns

        Code:
        {code}

        Return ONLY JSON:
        {{
          "safe": true/false,
          "reason": "short reason"
        }}
        """

        res = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt
        )

        try:
            data = json.loads(res.text)
            return data.get("safe", False), data.get("reason", "")
        except:
            return False, "AI response parse failed"

    except Exception as e:
        return False, str(e)


# ---------------- CONFIG ----------------
@app.route('/save_config', methods=['POST'])
def save_config():
    with open(CONFIG_PATH, 'w') as f:
        json.dump(request.json, f)
    return jsonify({"status": "API Key Saved"})


# ---------------- WORKSPACE ----------------
@app.route('/save_workspace', methods=['POST'])
def save_workspace():
    try:
        with open('workspace_state.json', 'w') as f:
            json.dump(request.json, f, indent=2)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/load_workspace', methods=['GET'])
def load_workspace():
    if os.path.exists('workspace_state.json'):
        with open('workspace_state.json', 'r') as f:
            return jsonify(json.load(f))
    return jsonify({"tabs": {}})


# ---------------- LEETCODE ----------------
def query_leetcode(query, variables=None):
    url = "https://leetcode.com/graphql"
    r = requests.post(url, json={'query': query, 'variables': variables})
    return r.json()


@app.route('/get_leetcode_problems', methods=['GET'])
def get_leetcode_list():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            return jsonify(json.load(f))

    try:
        r = requests.get("https://leetcode.com/api/problems/all/", headers={'User-Agent': 'Mozilla/5.0'})
        data = r.json()
        problems = [
            {"title": p['stat']['question__title'], "titleSlug": p['stat']['question__title_slug']}
            for p in data['stat_status_pairs']
        ]
        with open(CACHE_FILE, 'w') as f:
            json.dump(problems, f)
        return jsonify(problems)
    except:
        return jsonify([{"title": "Two Sum", "titleSlug": "two-sum"}])


@app.route('/get_problem_details', methods=['POST'])
def get_details():
    slug = request.json.get('slug')
    query = """
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        content
      }
    }
    """
    data = query_leetcode(query, {"titleSlug": slug})
    return jsonify({"content": data['data']['question']['content']})


# ---------------- AI FEATURES ----------------
def get_client():
    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)
    return genai.Client(api_key=config['api_key'])

@app.route('/generate_boilerplate', methods=['POST'])
def generate_boilerplate():
    try:
        data = request.json
        statement = data.get('statement', '')
        language = data.get('language', 'python')

        # 🧠 Pull user thinking from frontend (if available)
        steps = data.get('steps', {})
        s1 = steps.get('s1', '')
        s2 = steps.get('s2', '')
        s3 = steps.get('s3', '')
        s4 = steps.get('s4', '')

        client = get_client()

        prompt = f"""
        ROLE: Senior Software Engineer generating CLEAN BOILERPLATE.

        IMPORTANT:
        - DO NOT solve the problem
        - DO NOT implement full logic
        - ONLY create structure + placeholders

        ---------------- PROBLEM ----------------
        {statement}

        ---------------- USER THINKING ----------------
        Absorption:
        {s1}

        Pattern:
        {s2}

        Pseudocode:
        {s3}

        Dry Run:
        {s4}

        ---------------- TARGET ----------------
        Language: {language}

        ---------------- RULES ----------------

        GENERAL:
        - Use function name: solve
        - Leave TODO comments for logic
        - Keep structure clean and runnable

        PYTHON:
        - def solve(input_data):
        - include if __name__ == "__main__"

        JAVA:
        - MUST include:
            public class Main
            public static void main(String[] args)
        - include solve() method
        - use Scanner for input
        - DO NOT use class Solution

        JAVASCRIPT:
        - function solve(input)
        - simple stdin handling (Node style)

        OUTPUT:
        - ONLY code
        - NO explanation
        """

        res = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt
        )

        code = res.text.replace("```", "").strip()

        return jsonify({"code": code})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/solve', methods=['POST'])
def solve_problem():
    client = get_client()
    problem = request.json.get('problem')

    res = client.models.generate_content(
        model="gemini-flash-latest",
        contents=f"Explain optimal approach:\n{problem}"
    )

    return jsonify({"analysis": res.text})


@app.route('/validate_step', methods=['POST'])
def validate_step():
    client = get_client()
    data = request.json

    prompt = f"""
    Problem: {data.get('statement')}
    Step: {data.get('step')}
    Input: {data.get('content')}

    Give short feedback (<60 words)
    """

    res = client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt
    )

    return jsonify({"feedback": res.text})


@app.route('/generate_test_data', methods=['POST'])
def generate_test_data():
    try:
        client = get_client()
        data = request.json
        statement = data.get('statement')
        code = data.get('code')
        lang = data.get('language')

        prompt = f"""
        You are an expert SDET. Generate comprehensive unit tests for the following problem and code.
        
        PROBLEM: {statement}
        LANGUAGE: {lang}
        USER CODE: 
        {code}

        REQUIREMENTS:
        1. Write a test runner script that tests multiple edge cases (empty, large, negatives, etc.).
        2. The runner MUST print a formatted plain text tabular view of what failed/passed to stdout.
           Example format:
           | Test Case | Expected | Actual | Status |
           |-----------|----------|--------|--------|
           | [1,2]     | 3        | 3      | PASS   |
        3. The code you return will be concatenated to the bottom of the User Code.
        4. For Python: Write plain script logic that calls the user's function.
        5. For JavaScript: Write plain script logic that calls the user's function.
        6. For Java: Create a `class TestRunner {{ public static void main(String[] args) {{ ... }} }}`.
        7. ONLY return the raw code. NO markdown formatting, NO explanations.
        """

        res = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt
        )

        test_script = res.text.replace("```python", "").replace("```javascript", "").replace("```java", "").replace("```", "").strip()

        return jsonify({"test_script": test_script})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- EXECUTION (UPDATED WITH SAFETY) ----------------
@app.route('/run_code', methods=['POST'])
def run_code():
    try:
        code = request.json.get('code')
        lang = request.json.get('language')

        code_hash = hashlib.md5(code.encode('utf-8')).hexdigest()

        if code_hash not in safe_code_hashes:
            # ---- STATIC CHECK ----
            ok, msg = static_code_check(code)
            if not ok:
                return jsonify({"output": f"[BLOCKED - STATIC]\n{msg}", "success": False})

            # ---- AI CHECK ----
            safe, reason = ai_code_check(code)
            if not safe:
                return jsonify({"output": f"[BLOCKED - AI]\n{reason}", "success": False})
            
            safe_code_hashes.add(code_hash)

        with tempfile.TemporaryDirectory() as tmpdir:

            if lang == 'Python':
                path = os.path.join(tmpdir, "main.py")
                with open(path, 'w') as f:
                    f.write(code)

                result = subprocess.run(
                    ["python3", "-I", path],
                    capture_output=True,
                    text=True,
                    timeout=15
                )

            elif lang == 'Java':
                path = os.path.join(tmpdir, "Main.java")
                with open(path, 'w') as f:
                    f.write(code)
                print("Compiling... ")
                compile_res = subprocess.run(['javac', path], capture_output=True, text=True)
                if compile_res.returncode != 0:
                    return jsonify({"output": compile_res.stderr, "success": False})
                print("Running... ")
                main_class = 'TestRunner' if 'class TestRunner' in code else 'Main'
                result = subprocess.run(['java', '-cp', tmpdir, main_class], capture_output=True, text=True, timeout=30)

            elif lang == 'JavaScript':
                path = os.path.join(tmpdir, "solution.js")
                with open(path, 'w') as f:
                    f.write(code)
                result = subprocess.run(['node', path], capture_output=True, text=True, timeout=15)

            else:
                return jsonify({"output": "Unsupported language", "success": False})

            output = result.stdout or result.stderr

            return jsonify({
                "output": output,
                "success": result.returncode == 0
            })

    except subprocess.TimeoutExpired:
        return jsonify({"output": "[TIMEOUT] Infinite loop suspected", "success": False})

    except Exception as e:
        return jsonify({"output": str(e), "success": False})


# ---------------- FRONTEND ----------------
@app.route('/')
def home():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8500, debug=True)