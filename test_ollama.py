import ollama

response = ollama.chat(model='ministral-3:latest', messages=[
    {
        'role': 'user',
        'content': 'Pourquoi le ciel est bleu ?',
    },
])
print(response['message']['content'])
