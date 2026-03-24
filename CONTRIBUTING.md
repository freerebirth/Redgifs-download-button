# Contributing to Redgifs Downloader Button

First off, thank you for considering contributing to the Redgifs Downloader Button! It's people like you that make this tool better for everyone.

The following is a set of guidelines for contributing to this project. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Project Architecture & Setup](#project-architecture--setup)
  - [Development Setup](#development-setup)
- [Git Rules & Commit Guidelines](#git-rules--commit-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by a standard Open Source Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the repository owner.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as many details as possible.
* **Specify your browser and version** (Chrome vs Firefox, and version number).
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem.
* **Explain which behavior you expected to see instead and why.**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When you are creating an enhancement suggestion, please provide as many details as possible:

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
* **Explain why this enhancement would be useful** to most users.
* **Specify if this applies to Chrome, Firefox, or both**. Note that we aim to keep feature parity between both versions.

### Pull Requests

1. Fork the repo and create your branch from `main`.
2. Prefix your branch name based on the type of work: `feat/`, `fix/`, `refactor/`, `chore/`, or `docs/`.
3. If you've added or changed code, verify your changes work in both **Chrome** and **Firefox**.
4. Issue that pull request!

## Project Architecture & Setup

This extension is built with **Vanilla JavaScript, HTML, and CSS**, utilizing Manifest V3 APIs. There is no build step or bundler (e.g., no Node.js, Webpack, etc. required). 

- `chrome/`: The Chrome MV3 extension.
- `firefox/`: The Firefox MV3 extension (mirror of Chrome but uses `browser.*` APIs).

To avoid maintaining two completely different codebases, any core logic changes must be applied to **both** the `chrome/` and `firefox/` directories. 

### Development Setup

**Testing in Chrome:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode" in the top right.
3. Click "Load unpacked" and select the `chrome/` directory.

**Testing in Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select the `firefox/manifest.json` file.

> **Note**: Because this extension is rejected by the Web Stores (due to NSFW policy), it is distributed manually via GitHub Releases. Keep in mind that users will install updates manually.

## Git Rules & Commit Guidelines

To maintain a healthy commit history, all contributions must follow the repository's strict Git policy:

* **Never push directly to `main`**. All changes must go through a pull request from a feature branch.
* **Branch formatting**: Always use the prefixes: `feat/*`, `fix/*`, `refactor/*`, `chore/*`, `docs/*`.
* **Stage atomic commits**: Only stage files related to the specific feature or fix. Do not stage unrelated modified files.
* **Conventional Commits**: Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.
  * Examples: `feat: add auto-skip feed ads toggle`, `fix: use current URL to resolve video ID on /watch/ pages`
