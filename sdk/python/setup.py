from setuptools import setup, find_packages

setup(
    name="searchpick-sdk",
    version="1.0.0",
    description="Python SDK for SearchPick.ai Commerce Decision Engine",
    author="SearchPick.ai Team",
    packages=find_packages(),
    install_requires=[
        "httpx>=0.24.0",
        "websockets>=11.0",
    ],
    python_requires=">=3.8",
)
