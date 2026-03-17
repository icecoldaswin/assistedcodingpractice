from flask import Flask, request, jsonify, render_template
import json
import os
from google import genai
import tempfile
import subprocess
import requests 

app = Flask(__name__)

CONFIG_PATH = "gemini_config.json"
CACHE_FILE = 'leetcode_cache.json'

@app.route('/save_config', methods=['POST'])
def save_config():
    data = request.json
    with open(CONFIG_PATH, 'w') as f:
        json.dump(data, f)
    return jsonify({"status": "API Key Saved"})

# Helper to query LeetCode's GraphQL
def query_leetcode(query, variables=None):
    url = "https://leetcode.com/graphql"
    r = requests.post(url, json={'query': query, 'variables': variables})
    return r.json()

@app.route('/save_workspace', methods=['POST'])
def save_workspace():
    data = request.json
    try:
        with open('workspace_state.json', 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/load_workspace', methods=['GET'])
def load_workspace():
    if os.path.exists('workspace_state.json'):
        with open('workspace_state.json', 'r') as f:
            return jsonify(json.load(f))
    return jsonify({"tabs": {}})

@app.route('/get_leetcode_problems', methods=['GET'])
def get_leetcode_list():
    # 1. Try to load from Local Cache first
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            return jsonify(json.load(f))

    # 2. If no cache, attempt one-time bulk fetch
    url = "https://leetcode.com/api/problems/all/" # The "old" REST endpoint is often less protected
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            # Transform LC REST format to our format
            problems = [
                {"title": p['stat']['question__title'], "titleSlug": p['stat']['question__title_slug']}
                for p in data['stat_status_pairs']
            ]
            # Save to local file
            with open(CACHE_FILE, 'w') as f:
                json.dump(problems, f)
            return jsonify(problems)
    except Exception as e:
        print(f"Bulk fetch failed: {e}")

    # 3. Last Resort: Emergency Seed Data
    seed = [{"title": "Two Sum", "titleSlug": "two-sum"}, {"title": "LRU Cache", "titleSlug": "lru-cache"}]
    return jsonify(seed)

@app.route('/generate_test_data', methods=['POST'])
def generate_test_data():
    data = request.json
    problem_statement = data.get('statement')
    
    # We ask Gemini to create a 'test_suite.py' content
    prompt = f"""
    Context: LeetCode problem validation.
    Problem: {problem_statement}
    
    Task: Generate a standalone Python script that defines a list of test cases.
    Each test case should be a dictionary with 'input' and 'expected'.
    Also include a small runner loop that would test a function named 'solve'.
    
    Provide ONLY the Python code. No explanations.
    Include edge cases like empty inputs, large values, and negative numbers.
    """
    
    try:
        with open(CONFIG_PATH, 'r') as f:
            config = json.load(f)
        client = genai.Client(api_key=config['api_key'])
        response = client.models.generate_content(
            model="gemini-flash-latest", contents=prompt
        )
        test_script = response.text.replace('```python', '').replace('```', '').strip()
        return jsonify({"test_script": test_script})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
    # The content is returned as HTML
    return jsonify({"content": data['data']['question']['content']})

def get_universal_prompt(problem_statement, language):
    return f"""
    Act as a Master of Pattern Mapping. Break down the following problem using the 'Skeleton-Seeing' framework.
    
    PROBLEM: {problem_statement}
    TARGET LANGUAGE: {language}

    --- MANDATORY STRUCTURE ---

    ### Step 1: Problem Absorption
    Translate the technical jargon into a 'plain English' story. What is the core conflict?

    ### Step 2: The Pattern Hunt (The Diagnostic)
    Don't guess. Evaluate the following 'Geometric Dimensions' to find the skeleton:
    1. Relationship: Are there dependencies? (Graphs/Trees)
    2. Optimization: Do we need a Min/Max or 'Best' way? (Greedy/BFS/DP)
    3. Search Space: Is there a hidden 'threshold' or monotonicity? (Binary Search on Answer)
    4. Overlap: Are we solving the same sub-problem repeatedly? (DP/Memoization)
    Identify the confirmed Pattern(s).

    ### Step 3: Bridging the Representation Gap
    What is the distance between the Input Format and the Logic Shape? 
    (e.g., 'Input is an unsorted list, but logic requires a frequency map'). Define the necessary transformations.

    ### Step 4: The Logic Blueprint (Pseudocode)
    Provide the high-level logic in clean, language-agnostic pseudocode.

    ### Step 4.2: Implementation
    Provide a production-ready implementation in {language}. 
    Wrap the code in a standard markdown block.

    ### Step 5: The Hand Dry-Run
    Trace the execution using a small, concrete example. 
    YOU MUST REPRESENT THIS TRACE IN A MARKDOWN TABLE.
    Columns: Iteration/Step, Variable States, Decision Made, Result.
    """

@app.route('/solve', methods=['POST'])
def solve_problem():
    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)
    
    client = genai.Client(api_key=config['api_key'])
    user_input = request.json.get('problem')
    lang = request.json.get('language')
    
    prompt = get_universal_prompt(user_input, lang)
    
    # Using 2.0 Flash for speed and high-context reasoning
    response = client.models.generate_content(
        model="gemini-flash-latest", 
        contents=prompt
    )
    
    return jsonify({"analysis": response.text})

@app.route('/validate_step', methods=['POST'])
def validate_step():
    data = request.json
    problem_statement = data.get('statement')
    current_section = data.get('step')  # e.g., "Step 2: Pattern Hunt"
    user_input = data.get('content')
    
    # Enrichment: We define the "Target Geometry" for the AI
    prompt = f"""
    ROLE: Senior Algorithmic Mentor
    CONTEXT:
    Problem Statement: {problem_statement}
    User is currently working on: {current_section}
    User Input: "{user_input}"
    
    TASK:
    1. Analyze if the user's input correctly identifies the "Skeleton" or "Geometry" of the problem for this specific section.
    2. If the user is correct, respond with "LGTML" (Looks Good To My Logic) and a brief 'pro-tip' for the next step.
    3. If there is a gap, do NOT give the answer. Instead, point out the constraint they are missing or the "Representation Gap" they haven't bridged yet.
    
    CONSTRAINTS: 
    - Keep feedback under 60 words.
    - Be encouraging but technically precise.
    """
    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)
        
    client = genai.Client(api_key=config['api_key'])
    response = client.models.generate_content(
        model="gemini-flash-latest", 
        contents=prompt
    )
    
    return jsonify({"feedback": response.text})

@app.route('/run_code', methods=['POST'])
def run_code():
    data = request.json
    code = data.get('code')
    lang = data.get('language')
    
    # We use a temporary directory to avoid file collisions
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            if lang == 'Python':
                file_path = os.path.join(tmpdir, "solution.py")
                with open(file_path, 'w') as f: f.write(code)
                result = subprocess.run(['python3', file_path], capture_output=True, text=True, timeout=5)
            
            elif lang == 'Java':
                file_path = os.path.join(tmpdir, "Main.java")
                with open(file_path, 'w') as f: f.write(code)
                # Compile
                compile_res = subprocess.run(['javac', file_path], capture_output=True, text=True)
                if compile_res.returncode != 0:
                    return jsonify({"output": compile_res.stderr, "success": False})
                # Run (Main is the class name defined in scaffold)
                result = subprocess.run(['java', '-cp', tmpdir, 'Main'], capture_output=True, text=True, timeout=5)

            elif lang == 'C++':
                file_path = os.path.join(tmpdir, "solution.cpp")
                exec_path = os.path.join(tmpdir, "a.out")
                with open(file_path, 'w') as f: f.write(code)
                # Compile
                compile_res = subprocess.run(['g++', file_path, '-o', exec_path], capture_output=True, text=True)
                if compile_res.returncode != 0:
                    return jsonify({"output": compile_res.stderr, "success": False})
                # Run
                result = subprocess.run([exec_path], capture_output=True, text=True, timeout=5)
            
            output = result.stdout if result.stdout else result.stderr
            return jsonify({"output": output, "success": result.returncode == 0})

        except subprocess.TimeoutExpired:
            return jsonify({"output": "Error: Execution timed out (Possible infinite loop).", "success": False})
        except Exception as e:
            return jsonify({"output": str(e), "success": False})

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8500, debug=True)