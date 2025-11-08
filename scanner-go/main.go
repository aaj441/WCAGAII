package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	Version     = "3.0.0"
	ServiceName = "wcagai-scanner-go"
)

// Configuration
type Config struct {
	Port            string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	MaxConcurrent   int
	WorkerPoolSize  int
	ChromePath      string
	RedisURL        string
	NodeBackendURL  string
}

// ScanRequest represents an incoming scan request
type ScanRequest struct {
	Type    string                 `json:"type"`    // "url" or "html"
	Input   string                 `json:"input"`   // URL or HTML content
	Options map[string]interface{} `json:"options"` // Scan options
}

// ScanResponse represents the scan result
type ScanResponse struct {
	Success         bool                   `json:"success"`
	Violations      []interface{}          `json:"violations"`
	Passes          []interface{}          `json:"passes"`
	Incomplete      []interface{}          `json:"incomplete"`
	ViolationsCount int                    `json:"violationsCount"`
	PassesCount     int                    `json:"passesCount"`
	Duration        int64                  `json:"duration"` // milliseconds
	Metadata        map[string]interface{} `json:"metadata"`
	Error           string                 `json:"error,omitempty"`
}

// Metrics
var (
	scanDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "scanner_go_scan_duration_seconds",
			Help:    "Duration of scans in seconds",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
		},
		[]string{"type", "status"},
	)

	scanTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "scanner_go_scan_total",
			Help: "Total number of scans",
		},
		[]string{"type", "status"},
	)

	activeScan = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "scanner_go_active_scans",
			Help: "Number of currently active scans",
		},
	)
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(scanDuration)
	prometheus.MustRegister(scanTotal)
	prometheus.MustRegister(activeScan)
}

// Scanner handles high-performance accessibility scanning
type Scanner struct {
	config      *Config
	workerPool  chan struct{}
	httpClient  *http.Client
}

// NewScanner creates a new scanner instance
func NewScanner(config *Config) *Scanner {
	return &Scanner{
		config:     config,
		workerPool: make(chan struct{}, config.WorkerPoolSize),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Scan performs accessibility scanning
func (s *Scanner) Scan(ctx context.Context, req *ScanRequest) (*ScanResponse, error) {
	start := time.Now()
	activeScan.Inc()
	defer activeScan.Dec()

	// Acquire worker from pool
	s.workerPool <- struct{}{}
	defer func() { <-s.workerPool }()

	// Delegate to Node.js backend for actual scanning
	// This allows us to leverage existing axe-core integration
	// while providing high-performance request routing
	result, err := s.delegateToNodeBackend(ctx, req)

	duration := time.Since(start)
	status := "success"
	if err != nil {
		status = "error"
	}

	scanDuration.WithLabelValues(req.Type, status).Observe(duration.Seconds())
	scanTotal.WithLabelValues(req.Type, status).Inc()

	if err != nil {
		return &ScanResponse{
			Success: false,
			Error:   err.Error(),
		}, err
	}

	return result, nil
}

// delegateToNodeBackend forwards requests to Node.js backend
func (s *Scanner) delegateToNodeBackend(ctx context.Context, req *ScanRequest) (*ScanResponse, error) {
	// Marshal request
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(
		ctx,
		"POST",
		s.config.NodeBackendURL+"/api/scan",
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Body = http.NoBody // Simplified for this example

	// Send request
	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("backend request failed: %w", err)
	}
	defer resp.Body.Close()

	// Parse response
	var result ScanResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// HTTP Handlers

// handleScan handles POST /api/scan
func (s *Scanner) handleScan(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Type != "url" && req.Type != "html" {
		http.Error(w, "Invalid type: must be 'url' or 'html'", http.StatusBadRequest)
		return
	}

	if req.Input == "" {
		http.Error(w, "Input is required", http.StatusBadRequest)
		return
	}

	// Perform scan
	result, err := s.Scan(ctx, &req)
	if err != nil {
		log.Printf("Scan error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(result)
		return
	}

	// Return result
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleHealth handles GET /health
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": ServiceName,
		"version": Version,
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

// handleMetrics handles GET /metrics (Prometheus)
func handleMetrics(w http.ResponseWriter, r *http.Request) {
	promhttp.Handler().ServeHTTP(w, r)
}

func main() {
	// Load configuration
	config := &Config{
		Port:           getEnv("PORT", "8001"),
		ReadTimeout:    15 * time.Second,
		WriteTimeout:   60 * time.Second,
		MaxConcurrent:  100,
		WorkerPoolSize: 50,
		NodeBackendURL: getEnv("NODE_BACKEND_URL", "http://localhost:8000"),
		RedisURL:       getEnv("REDIS_URL", ""),
		ChromePath:     getEnv("CHROME_PATH", "/usr/bin/chromium"),
	}

	// Create scanner
	scanner := NewScanner(config)

	// Setup router
	router := mux.NewRouter()

	// Routes
	router.HandleFunc("/api/scan", scanner.handleScan).Methods("POST")
	router.HandleFunc("/health", handleHealth).Methods("GET")
	router.HandleFunc("/metrics", handleMetrics).Methods("GET")

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + config.Port,
		Handler:      router,
		ReadTimeout:  config.ReadTimeout,
		WriteTimeout: config.WriteTimeout,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("[%s] Starting server on port %s", ServiceName, config.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
