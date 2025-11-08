// Configuration
const API_URL = 'http://localhost:8000'; // Change this to your production API URL

// DOM Elements
const scanForm = document.getElementById('scan-form');
const scanButton = document.getElementById('scan-button');
const urlInputGroup = document.getElementById('url-input-group');
const htmlInputGroup = document.getElementById('html-input-group');
const urlInput = document.getElementById('url-input');
const htmlInput = document.getElementById('html-input');
const resultsSection = document.getElementById('results-section');
const errorMessage = document.getElementById('error-message');
const spinner = document.querySelector('.spinner');
const btnText = document.querySelector('.btn-text');

// Radio buttons
const radioUrl = document.getElementById('type-url');
const radioHtml = document.getElementById('type-html');

// Results elements
const complianceScore = document.getElementById('compliance-score');
const violationsCount = document.getElementById('violations-count');
const passesCount = document.getElementById('passes-count');
const scanTime = document.getElementById('scan-time');
const violationsList = document.getElementById('violations-list');

// Severity elements
const barCritical = document.getElementById('bar-critical');
const barSerious = document.getElementById('bar-serious');
const barModerate = document.getElementById('bar-moderate');
const barMinor = document.getElementById('bar-minor');
const countCritical = document.getElementById('count-critical');
const countSerious = document.getElementById('count-serious');
const countModerate = document.getElementById('count-moderate');
const countMinor = document.getElementById('count-minor');

// Export buttons
const exportJsonBtn = document.getElementById('export-json');
const exportCsvBtn = document.getElementById('export-csv');

// Store last scan results
let lastScanResults = null;

// Event Listeners
radioUrl.addEventListener('change', () => {
    urlInputGroup.classList.remove('hidden');
    htmlInputGroup.classList.add('hidden');
    urlInput.required = true;
    htmlInput.required = false;
});

radioHtml.addEventListener('change', () => {
    urlInputGroup.classList.add('hidden');
    htmlInputGroup.classList.remove('hidden');
    urlInput.required = false;
    htmlInput.required = true;
});

scanForm.addEventListener('submit', handleScan);
exportJsonBtn.addEventListener('click', exportAsJSON);
exportCsvBtn.addEventListener('click', exportAsCSV);

// Handle Scan Submission
async function handleScan(e) {
    e.preventDefault();

    // Hide previous results and errors
    resultsSection.classList.add('hidden');
    errorMessage.classList.add('hidden');

    // Get form data
    const scanType = document.querySelector('input[name="scanType"]:checked').value;
    const input = scanType === 'url' ? urlInput.value : htmlInput.value;

    if (!input.trim()) {
        showError('Please provide a URL or HTML code to scan');
        return;
    }

    // Show loading state
    setLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: scanType,
                input: input,
                options: {}
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Scan failed');
        }

        const results = await response.json();
        lastScanResults = results;

        displayResults(results);

    } catch (error) {
        console.error('Scan error:', error);
        showError(error.message || 'Failed to scan. Please check your connection and try again.');
    } finally {
        setLoading(false);
    }
}

// Display Results
function displayResults(results) {
    // Show results section
    resultsSection.classList.remove('hidden');

    // Update summary cards
    complianceScore.textContent = `${results.summary.complianceScore}%`;
    violationsCount.textContent = results.summary.violations;
    passesCount.textContent = results.summary.passes;
    scanTime.textContent = `${(results.scanTime / 1000).toFixed(2)}s`;

    // Update severity bars
    const severity = results.summary.violationsBySeverity;
    const maxViolations = Math.max(
        severity.critical,
        severity.serious,
        severity.moderate,
        severity.minor,
        1
    );

    updateSeverityBar(barCritical, countCritical, severity.critical, maxViolations);
    updateSeverityBar(barSerious, countSerious, severity.serious, maxViolations);
    updateSeverityBar(barModerate, countModerate, severity.moderate, maxViolations);
    updateSeverityBar(barMinor, countMinor, severity.minor, maxViolations);

    // Display violations
    displayViolations(results.violations);

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update Severity Bar
function updateSeverityBar(barElement, countElement, count, maxCount) {
    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
    barElement.style.width = `${percentage}%`;
    barElement.setAttribute('aria-valuenow', percentage);
    countElement.textContent = count;
}

// Display Violations
function displayViolations(violations) {
    violationsList.innerHTML = '';

    if (violations.length === 0) {
        violationsList.innerHTML = '<p style="color: var(--success-color); font-weight: 600;">🎉 No violations found! Your page meets WCAG 2.2 AA standards.</p>';
        return;
    }

    violations.forEach((violation, index) => {
        const violationItem = document.createElement('div');
        violationItem.className = `violation-item impact-${violation.impact}`;

        violationItem.innerHTML = `
            <div class="violation-header">
                <h4 class="violation-title">${index + 1}. ${violation.help}</h4>
                <span class="violation-impact impact-${violation.impact}">${violation.impact}</span>
            </div>
            <p class="violation-description">${violation.description}</p>
            <div class="violation-help">
                <a href="${violation.helpUrl}" target="_blank" rel="noopener">
                    Learn more →
                </a>
            </div>
            <details class="violation-nodes">
                <summary>Affected Elements (${violation.nodes.length})</summary>
                ${violation.nodes.map((node, nodeIndex) => `
                    <div class="node-item">
                        <div class="node-target"><strong>Selector:</strong> ${node.target.join(', ')}</div>
                        <div class="node-html"><code>${escapeHtml(node.html)}</code></div>
                        ${node.failureSummary ? `<p style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.875rem;">${node.failureSummary}</p>` : ''}
                    </div>
                `).join('')}
            </details>
        `;

        violationsList.appendChild(violationItem);
    });
}

// Export as JSON
function exportAsJSON() {
    if (!lastScanResults) return;

    const dataStr = JSON.stringify(lastScanResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `wcag-scan-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

// Export as CSV
function exportAsCSV() {
    if (!lastScanResults) return;

    const violations = lastScanResults.violations;
    let csv = 'ID,Impact,Description,Help,Help URL,Affected Elements\n';

    violations.forEach(violation => {
        const row = [
            violation.id,
            violation.impact,
            `"${violation.description.replace(/"/g, '""')}"`,
            `"${violation.help.replace(/"/g, '""')}"`,
            violation.helpUrl,
            violation.nodes.length
        ];
        csv += row.join(',') + '\n';
    });

    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `wcag-scan-${Date.now()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
}

// Helper Functions
function setLoading(isLoading) {
    if (isLoading) {
        scanButton.disabled = true;
        spinner.classList.remove('hidden');
        btnText.textContent = 'Scanning...';
    } else {
        scanButton.disabled = false;
        spinner.classList.add('hidden');
        btnText.textContent = 'Scan Now';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

// Initial setup
console.log('WCAGAI v3.0 Frontend Loaded');
console.log('API URL:', API_URL);
