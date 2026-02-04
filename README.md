<div align="center"> 
   <img width="600" height="600" alt="CoinFlow logo" src="https://github.com/javiiervm/CoinFlow/blob/main/assets/Banner.png" /> 
   <br /><br />
   <img src="https://img.shields.io/github/last-commit/javiiervm/CoinFlow/develop" alt="Last Commit (Develop)" /> 
   <img src="https://img.shields.io/badge/platform-linux%20%7C%20windows%20%7C%20macos-lightgrey" alt="Platform" /> 
   <img src="https://img.shields.io/github/issues/javiiervm/CoinFlow" alt="Issues" /> 
   <img src="https://img.shields.io/github/stars/javiiervm/CoinFlow" alt="Stars" />
   <br />
   <img src="https://img.shields.io/badge/python-3.10%2B-yellow" /> 
   <img src="https://img.shields.io/badge/flask-3.x-blue" /> 
   <img src="https://img.shields.io/badge/html5-E34F26?style=flat&logo=html5&logoColor=white" /> 
   <img src="https://img.shields.io/badge/css3-1572B6?style=flat&logo=css3&logoColor=white" /> 
   <img src="https://img.shields.io/badge/javascript-F7DF1E?style=flat&logo=javascript&logoColor=black" /> 
   <br /><br /><br />
   <b>CoinFlow</b> es una aplicación web de gestión financiera personal diseñada para ser simple, intuitiva y visualmente atractiva. Te permite llevar un control detallado de tus ingresos y gastos, gestionar tus ahorros mediante "huchas" y visualizar tu balance en diferentes divisas.
   <br /><br />
</div>

## 🚀 Características Principales

*   **Gestión de Transacciones:** Registra fácilmente tus ingresos y gastos.
*   **Huchas de Ahorro:** Crea objetivos de ahorro personalizados (huchas) y asigna ingresos directamente a ellas o paga gastos desde ellas.
*   **Interfaz Moderna:** Diseño limpio y responsivo utilizando Tailwind CSS, con una interfaz adaptable con soporte para temas visuales.
*   **Persistencia de Datos:** Tus datos se guardan localmente en un archivo JSON (`data.json`), asegurando que no pierdas tu información entre sesiones y permitiendo un acceso offline a la aplicación.
*   **Soporte Multidivisa:** Visualiza tu saldo total en Euros (€) y Dólares ($).

## 📂 Estructura del Proyecto

El proyecto sigue una estructura estándar de una aplicación Flask:

```text
CoinFlow/
├── app.py                # Archivo principal de la aplicación Flask (Backend)
├── requirements.txt      # Lista de dependencias de Python
├── data.json             # Archivo de base de datos (se crea automáticamente)
├── templates/
│   └── index.html        # Plantilla HTML principal de la aplicación
├── static/
│   ├── css/
│   │   └── style.css     # Estilos CSS personalizados
│   ├── js/
│   │   └── app.js        # Lógica del Frontend (JavaScript)
│   └── Logo.png          # Icono de la aplicación
└── assets/
    └── Banner.png        # Banner utilizado en este README
```

## 🛠️ Instalación y Uso

Sigue estos pasos para ejecutar CoinFlow en tu máquina local:

### Prerrequisitos

*   Python 3.10 o superior instalado en tu sistema.
*   Git (opcional, para clonar el repositorio).

### Pasos

1.  **Clonar el repositorio** (o descargar el código fuente):
    ```bash
    git clone https://github.com/javiiervm/CoinFlow.git
    cd CoinFlow
    ```

2.  **Crear un entorno virtual** (recomendado):
    *   En Windows:
        ```bash
        python -m venv venv
        venv\Scripts\activate
        ```
    *   En macOS/Linux:
        ```bash
        python3 -m venv venv
        source venv/bin/activate
        ```

3.  **Instalar las dependencias:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Ejecutar la aplicación:**
    ```bash
    python app.py
    ```

5.  **Abrir en el navegador:**
    Visita `http://localhost:5000` (o la dirección que muestre la terminal) para empezar a usar CoinFlow.
