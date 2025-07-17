@@ .. @@
 import React, { useState, useCallback } from "react";
+import { ErrorBoundary } from "react-error-boundary";
+import { HelmetProvider, Helmet } from "react-helmet-async";
 import "./App.css";
 import ExamSelector from "./components/ExamSelector";
 import FileUploader from "./components/FileUploader";
 import ProcessingStatus from "./components/ProcessingStatus";
 import { LoadingSpinner } from "./components/LoadingSpinner";
 import { ProcessedFile, ConversionResult } from "./types";
 import { EXAM_CONFIGS } from "./config/examConfigs";
 import { DocumentAnalyzerService } from "./services/documentAnalyzer";
 import { RustFormatterService } from "./services/rustFormatter";
 import { ZipService } from "./services/zipService";

+// Error Fallback Component
+function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
+  return (
+    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
+      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
+        <div className="text-red-500 text-6xl mb-4">⚠️</div>
+        <h2 className="text-2xl font-bold text-gray-800 mb-4">Something went wrong</h2>
+        <p className="text-gray-600 mb-6">{error.message}</p>
+        <button
+          onClick={resetErrorBoundary}
+          className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
+        >
+          Try again
+        </button>
+      </div>
+    </div>
+  );
+}
+
 function App() {
   const [selectedExam, setSelectedExam] = useState("upsc");
   const [files, setFiles] = useState<ProcessedFile[]>([]);
   const [isProcessing, setIsProcessing] = useState(false);
   const [isInitializing, setIsInitializing] = useState(false);
   const [currentStep, setCurrentStep] = useState("");
   const [zipBlob, setZipBlob] = useState<Blob | null>(null);
   const [servicesReady, setServicesReady] = useState(false);
+  const [error, setError] = useState<string | null>(null);

   // Services
   const [documentAnalyzer] = useState(() => new DocumentAnalyzerService());
   const [rustFormatter] = useState(() => new RustFormatterService());
   const [zipService] = useState(() => new ZipService());

   const examConfig = EXAM_CONFIGS[selectedExam];

   // Initialize services when exam changes
   const initializeServices = useCallback(async (examCode: string) => {
     setIsInitializing(true);
+    setError(null);
     try {
       // Initialize Python analyzer
       await documentAnalyzer.initialize();
       
       // Initialize Rust formatter with exam config
       await rustFormatter.initialize();
       await rustFormatter.setExamConfig(EXAM_CONFIGS[examCode]);
       
       setServicesReady(true);
     } catch (error) {
       console.error('Failed to initialize services:', error);
+      setError(error instanceof Error ? error.message : 'Failed to initialize services');
     } finally {
       setIsInitializing(false);
     }
   }, [documentAnalyzer, rustFormatter]);

   const handleExamChange = useCallback((examCode: string) => {
     setSelectedExam(examCode);
     // Clear files when exam changes
     setFiles([]);
     setZipBlob(null);
     setServicesReady(false);
+    setError(null);
     initializeServices(examCode);
   }, [initializeServices]);

   // Initialize services on first load
   React.useEffect(() => {
     initializeServices(selectedExam);
   }, [initializeServices, selectedExam]);

   const handleFilesChange = useCallback((newFiles: ProcessedFile[]) => {
     setFiles(newFiles);
     setZipBlob(null); // Clear previous zip when files change
+    setError(null);
   }, []);

   const processDocuments = async () => {
     if (files.length === 0 || !servicesReady) return;

     setIsProcessing(true);
     setZipBlob(null);
+    setError(null);

     try {
       // Step 1: Analyze documents with Python WASM
       setCurrentStep("Analyzing document types...");
       setFiles(prev => prev.map(f => ({ ...f, status: 'processing', progress: 25 })));

       const analyzedFiles = await documentAnalyzer.analyzeDocuments(files, selectedExam);
       setFiles(analyzedFiles);

       // Step 2: Format documents with Rust WASM
       setCurrentStep("Formatting documents...");
       setFiles(prev => prev.map(f => ({ ...f, progress: 50 })));

       const formattedFiles = await rustFormatter.formatDocuments(
         analyzedFiles,
         examConfig,
         (progress) => {
           setFiles(prev => prev.map(f => ({ ...f, progress: 50 + (progress * 0.4) })));
         }
       );
       setFiles(formattedFiles);

       // Step 3: Create ZIP file
       setCurrentStep("Creating download package...");
       setFiles(prev => prev.map(f => ({ ...f, progress: 90 })));

       const zipBlob = await zipService.createZipFromFiles(formattedFiles, selectedExam);
       setZipBlob(zipBlob);

       // Complete
       setFiles(prev => prev.map(f => ({ ...f, progress: 100 })));
       setCurrentStep("Processing complete!");

     } catch (error) {
       console.error('Processing error:', error);
+      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
+      setError(errorMessage);
       setFiles(prev => prev.map(f => ({ 
         ...f, 
         status: 'error', 
-        error: error instanceof Error ? error.message : 'Processing failed' 
+        error: errorMessage
       })));
     } finally {
       setIsProcessing(false);
       setTimeout(() => setCurrentStep(""), 3000);
     }
   };

   const downloadZip = () => {
     if (!zipBlob) return;

     const url = URL.createObjectURL(zipBlob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${selectedExam.toUpperCase()}_documents_${new Date().toISOString().split('T')[0]}.zip`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
   };

   const canProcess = files.length > 0 && !isProcessing && servicesReady;
   const canDownload = zipBlob !== null && files.some(f => f.status === 'completed');

+  // Show error state
+  if (error && !isInitializing) {
+    return (
+      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
+        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
+          <div className="text-red-500 text-6xl mb-4">❌</div>
+          <h2 className="text-2xl font-bold text-gray-800 mb-4">Service Error</h2>
+          <p className="text-gray-600 mb-6">{error}</p>
+          <button
+            onClick={() => {
+              setError(null);
+              initializeServices(selectedExam);
+            }}
+            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
+          >
+            Retry Initialization
+          </button>
+        </div>
+      </div>
+    );
+  }
+
   if (isInitializing) {
     return (
       <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
         <LoadingSpinner message="Initializing WebAssembly modules..." />
       </div>
     );
   }

   return (
-    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
-      {/* Header */}
-      <div className="bg-white shadow-sm">
-        <div className="max-w-7xl mx-auto px-4 py-6">
-          <h1 className="text-4xl font-bold text-center">
-            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
-              getConvertedExams.io
-            </span>
-          </h1>
-          <p className="text-xl text-gray-600 text-center mt-2">
-            AI-Powered Document Converter for Competitive Exams
-          </p>
-          <div className="text-center mt-2">
-            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
-              servicesReady 
-                ? 'bg-green-100 text-green-800' 
-                : 'bg-yellow-100 text-yellow-800'
-            }`}>
-              {servicesReady ? '✓ WebAssembly Ready' : '⏳ Loading WebAssembly...'}
-            </span>
+    <ErrorBoundary FallbackComponent={ErrorFallback}>
+      <HelmetProvider>
+        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
+          <Helmet>
+            <title>getConvertedExams.io - AI Document Converter for Competitive Exams</title>
+            <meta name="description" content="Convert and format documents for UPSC, NEET, JEE, CAT, GATE exams with AI-powered document detection and smart formatting." />
+            <meta name="keywords" content="document converter, competitive exams, UPSC, NEET, JEE, CAT, GATE, document formatting" />
+            <meta property="og:title" content="getConvertedExams.io - AI Document Converter" />
+            <meta property="og:description" content="AI-powered document converter for competitive exam applications" />
+            <meta property="og:type" content="website" />
+            <link rel="canonical" href="https://getconvertedexams.io" />
+          </Helmet>
+          
+          {/* Header */}
+          <div className="bg-white shadow-sm">
+            <div className="max-w-7xl mx-auto px-4 py-6">
+              <h1 className="text-4xl font-bold text-center">
+                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
+                  getConvertedExams.io
+                </span>
+              </h1>
+              <p className="text-xl text-gray-600 text-center mt-2">
+                AI-Powered Document Converter for Competitive Exams
+              </p>
+              <div className="text-center mt-2">
+                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
+                  servicesReady 
+                    ? 'bg-green-100 text-green-800' 
+                    : 'bg-yellow-100 text-yellow-800'
+                }`}>
+                  {servicesReady ? '✓ WebAssembly Ready' : '⏳ Loading WebAssembly...'}
+                </span>
+              </div>
+            </div>
           </div>
-        </div>
-      </div>

-      <div className="max-w-7xl mx-auto px-4 py-8">
-        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
-          {/* Left Sidebar - Exam Selection */}
-          <div className="lg:col-span-1">
-            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-8">
-              <ExamSelector 
-                selectedExam={selectedExam} 
-                onExamChange={handleExamChange} 
-                disabled={isInitializing || isProcessing}
-              />
-              
-              {/* Exam Info */}
-              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
-                <h4 className="font-semibold text-gray-800 mb-2">
-                  {examConfig.name} Requirements
-                </h4>
-                <ul className="text-sm text-gray-600 space-y-1">
-                  <li>• Max file size: {examConfig.maxFileSize}KB</li>
-                  <li>• Photo: {examConfig.formats.photo.width}×{examConfig.formats.photo.height}px</li>
-                  <li>• Signature: {examConfig.formats.signature.width}×{examConfig.formats.signature.height}px</li>
-                  <li>• Documents: {examConfig.formats.documents.format} format</li>
-                </ul>
+          <div className="max-w-7xl mx-auto px-4 py-8">
+            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
+              {/* Left Sidebar - Exam Selection */}
+              <div className="lg:col-span-1">
+                <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-8">
+                  <ExamSelector 
+                    selectedExam={selectedExam} 
+                    onExamChange={handleExamChange} 
+                    disabled={isInitializing || isProcessing}
+                  />
+                  
+                  {/* Exam Info */}
+                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
+                    <h4 className="font-semibold text-gray-800 mb-2">
+                      {examConfig.name} Requirements
+                    </h4>
+                    <ul className="text-sm text-gray-600 space-y-1">
+                      <li>• Max file size: {examConfig.maxFileSize}KB</li>
+                      <li>• Photo: {examConfig.formats.photo.width}×{examConfig.formats.photo.height}px</li>
+                      <li>• Signature: {examConfig.formats.signature.width}×{examConfig.formats.signature.height}px</li>
+                      <li>• Documents: {examConfig.formats.documents.format} format</li>
+                    </ul>
+                  </div>
+                </div>
               </div>
-            </div>
-          </div>

-          {/* Main Content */}
-          <div className="lg:col-span-3 space-y-8">
-            {/* File Upload */}
-            <div className="bg-white rounded-2xl shadow-xl">
-              <FileUploader
-                files={files}
-                onFilesChange={handleFilesChange}
-                maxFileSize={examConfig.maxFileSize}
-                allowedFormats={examConfig.allowedFormats}
-                isProcessing={isProcessing || isInitializing}
-                disabled={!servicesReady}
-              />
-            </div>
+              {/* Main Content */}
+              <div className="lg:col-span-3 space-y-8">
+                {/* File Upload */}
+                <div className="bg-white rounded-2xl shadow-xl">
+                  <FileUploader
+                    files={files}
+                    onFilesChange={handleFilesChange}
+                    maxFileSize={examConfig.maxFileSize}
+                    allowedFormats={examConfig.allowedFormats}
+                    isProcessing={isProcessing || isInitializing}
+                    disabled={!servicesReady}
+                  />
+                </div>

-            {/* Convert Button */}
-            {files.length > 0 && (
-              <div className="text-center">
-                <button
-                  onClick={processDocuments}
-                  disabled={!canProcess}
-                  className={`px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
-                    canProcess
-                      ? "bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-700 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105"
-                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
-                  }`}
-                >
-                  {isProcessing ? "Processing..." : `Convert ${files.length} Files`}
-                </button>
-                {!servicesReady && (
-                  <p className="text-sm text-gray-500 mt-2">
-                    Please wait for WebAssembly modules to load...
-                  </p>
+                {/* Convert Button */}
+                {files.length > 0 && (
+                  <div className="text-center">
+                    <button
+                      onClick={processDocuments}
+                      disabled={!canProcess}
+                      className={`px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
+                        canProcess
+                          ? "bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-700 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105"
+                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
+                      }`}
+                    >
+                      {isProcessing ? "Processing..." : `Convert ${files.length} Files`}
+                    </button>
+                    {!servicesReady && (
+                      <p className="text-sm text-gray-500 mt-2">
+                        Please wait for WebAssembly modules to load...
+                      </p>
+                    )}
+                  </div>
                 )}
+
+                {/* Processing Status */}
+                <ProcessingStatus
+                  files={files}
+                  isProcessing={isProcessing}
+                  currentStep={currentStep}
+                  onDownload={downloadZip}
+                  canDownload={canDownload}
+                />
               </div>
-            )}
+            </div>
+          </div>

-            {/* Processing Status */}
-            <ProcessingStatus
-              files={files}
-              isProcessing={isProcessing}
-              currentStep={currentStep}
-              onDownload={downloadZip}
-              canDownload={canDownload}
-            />
+          {/* Footer */}
+          <footer className="bg-white border-t mt-16">
+            <div className="max-w-7xl mx-auto px-4 py-8">
+              <div className="text-center text-gray-600">
+                <p className="mb-2">
+                  Powered by WebAssembly • Python + Rust + TypeScript
+                </p>
+                <p className="text-sm">
+                  All processing happens in your browser. Your documents never leave your device.
+                </p>
+                <p className="text-xs mt-4">
+                  Version 1.0.0 • Built with ❤️ for competitive exam aspirants
+                </p>
+              </div>
+            </div>
+          </footer>
+        </div>
+      </HelmetProvider>
+    </ErrorBoundary>
+  );
+}
+
+export default App;