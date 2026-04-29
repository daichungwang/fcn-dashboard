from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="os.getenv("NVIDIA_API_KEY", "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"
)

prompt = """
請分析 NVDA

輸出格式:
1. company_structure
2. customer_analysis
3. competition
4. financial_quality
5. risk_opportunity
6. valuation
7. fcn_view
"""

completion = client.chat.completions.create(
    model="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    messages=[
        {
            "role":"user",
            "content":prompt
        }
    ]
)

print(completion.choices[0].message.content)
