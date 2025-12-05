"""
RemYA SQL Assistant
Pose des questions en français sur ta base de données SQL
"""

import ollama
import mysql.connector
from mysql.connector import Error

# ============================================
# CONFIGURATION - À REMPLIR
# ============================================

DB_CONFIG = {
    'host': 'app.2minmax.com',      # Ex: sql123.phpnet.org ou xxxxx.mysql.db
    'database': '2mm_prod',
    'user': '2mm_prod',
    'password': '6hy@9oS7&G9`',
    'port': 3306
}


MODEL = 'ministral-3:latest'  # Ton modèle Ollama

# ============================================
# FONCTIONS
# ============================================

def connect_db():
    """Connexion à la base de données"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if conn.is_connected():
            print(f"✅ Connecté à {DB_CONFIG['database']}")
            return conn
    except Error as e:
        print(f"❌ Erreur de connexion: {e}")
        return None

def get_schema(conn):
    """Récupère le schéma de la base (tables et colonnes)"""
    cursor = conn.cursor()

    # Récupérer toutes les tables
    cursor.execute("SHOW TABLES")
    tables = [table[0] for table in cursor.fetchall()]

    schema = []
    for table in tables:
        cursor.execute(f"DESCRIBE `{table}`")
        columns = cursor.fetchall()
        cols = [f"{col[0]} ({col[1]})" for col in columns]
        schema.append(f"Table `{table}`: {', '.join(cols)}")

    cursor.close()
    return "\n".join(schema)

def question_to_sql(question: str, schema: str) -> str:
    """Utilise Ollama pour convertir une question en SQL"""

    prompt = f"""Tu es un expert SQL. Convertis la question utilisateur en requête SQL.

SCHEMA DE LA BASE:
{schema}

REGLES:
- Génère UNIQUEMENT la requête SQL, rien d'autre
- Pas d'explication, pas de markdown, juste le SQL
- Utilise des backticks pour les noms de tables/colonnes
- Limite à 50 résultats si pas de LIMIT spécifié

QUESTION: {question}

SQL:"""

    response = ollama.chat(model=MODEL, messages=[
        {'role': 'user', 'content': prompt}
    ])

    sql = response['message']['content'].strip()
    # Nettoyer si le modèle a ajouté des backticks markdown
    sql = sql.replace('```sql', '').replace('```', '').strip()

    return sql

def execute_sql(conn, sql: str):
    """Exécute la requête SQL et retourne les résultats"""
    cursor = conn.cursor()
    try:
        cursor.execute(sql)

        # Si c'est un SELECT, récupérer les résultats
        if sql.strip().upper().startswith('SELECT'):
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            return {'columns': columns, 'rows': rows, 'count': len(rows)}
        else:
            conn.commit()
            return {'affected': cursor.rowcount}

    except Error as e:
        return {'error': str(e)}
    finally:
        cursor.close()

def format_response(question: str, sql: str, result: dict) -> str:
    """Utilise Ollama pour reformuler le résultat"""

    if 'error' in result:
        return f"❌ Erreur SQL: {result['error']}"

    # Limiter les données pour le prompt
    data_preview = str(result.get('rows', [])[:10])

    prompt = f"""L'utilisateur a posé cette question: "{question}"

J'ai exécuté cette requête SQL: {sql}

Résultat ({result.get('count', 0)} lignes):
Colonnes: {result.get('columns', [])}
Données: {data_preview}

Reformule ce résultat de façon naturelle et concise en français.
Si beaucoup de résultats, fais un résumé."""

    response = ollama.chat(model=MODEL, messages=[
        {'role': 'user', 'content': prompt}
    ])

    return response['message']['content']

# ============================================
# BOUCLE PRINCIPALE
# ============================================

def main():
    print("=" * 50)
    print("🤖 RemYA SQL Assistant")
    print(f"🧠 Modèle: {MODEL}")
    print(f"🗄️  Base: {DB_CONFIG['database']}@{DB_CONFIG['host']}")
    print("=" * 50)

    # Connexion
    conn = connect_db()
    if not conn:
        return

    # Récupérer le schéma
    print("\n📊 Analyse du schéma de la base...")
    schema = get_schema(conn)
    print(f"\n{schema}\n")
    print("=" * 50)

    # Boucle de questions
    print("\nPose tes questions en français (tape 'quit' pour quitter)\n")

    while True:
        question = input("📝 Question: ").strip()

        if question.lower() in ['quit', 'exit', 'q']:
            break

        if not question:
            continue

        # Convertir en SQL
        print("\n🔄 Génération SQL...")
        sql = question_to_sql(question, schema)
        print(f"📋 SQL: {sql}")

        # Demander confirmation pour les requêtes non-SELECT
        if not sql.strip().upper().startswith('SELECT'):
            confirm = input("⚠️  Cette requête va modifier la base. Continuer? (o/n): ")
            if confirm.lower() != 'o':
                print("Annulé.\n")
                continue

        # Exécuter
        print("⚡ Exécution...")
        result = execute_sql(conn, sql)

        # Reformuler
        response = format_response(question, sql, result)
        print(f"\n💬 {response}\n")
        print("-" * 50 + "\n")

    conn.close()
    print("\n👋 Au revoir!")

if __name__ == "__main__":
    main()
