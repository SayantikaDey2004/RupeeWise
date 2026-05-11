import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { getDocuments, createDocument } from '@/db/api';
import { supabase } from '@/db/supabase';
import type { Document } from '@/types';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { backendJson, getApiBaseUrl } from '@/lib/backend-api';

export default function DocumentUpload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const bucketName = 'app-9hnntffjcnb5_documents_images';

  const getStoragePathFromPublicUrl = (publicUrl: string): string | null => {
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    const path = publicUrl.slice(idx + marker.length);
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  };

  const handleRemoveDocument = async (doc: Document) => {
    if (!user) return;
    if (processing === doc.id || uploading) return;

    try {
      const storagePath = getStoragePathFromPublicUrl(doc.file_url);
      if (storagePath) {
        const { error: removeError } = await supabase.storage.from(bucketName).remove([storagePath]);
        if (removeError) throw removeError;
      }

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id);
      if (deleteError) throw deleteError;

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));

      toast({
        title: 'Document removed',
        description: 'The uploaded document has been deleted.'
      });
    } catch (error) {
      console.error('Error removing document:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove document',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (!user) return;

    const loadDocuments = async () => {
      try {
        const docs = await getDocuments(user.id);
        setDocuments(docs);
      } catch (error) {
        console.error('Error loading documents:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDocuments();
  }, [user]);

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize to max 1080p
          const maxDimension = 1080;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
                  type: 'image/webp'
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/webp',
            0.8
          );
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) {
      toast({
        title: 'Error',
        description: 'No file selected or user not authenticated',
        variant: 'destructive'
      });
      return;
    }

    let file = e.target.files[0];
    
    // Validate file size
    if (file.size > 5242880) { // 5MB limit
      toast({
        title: 'File too large',
        description: 'File size must be less than 5MB',
        variant: 'destructive'
      });
      e.target.value = '';
      return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image (JPG, PNG, WEBP) or PDF file',
        variant: 'destructive'
      });
      e.target.value = '';
      return;
    }

    setUploading(true);

    try {
      // Compress if needed
      if (file.type.startsWith('image/') && file.size > 1048576) {
        file = await compressImage(file);
        toast({
          title: 'Image compressed',
          description: `File size reduced to ${(file.size / 1024).toFixed(2)} KB`
        });
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('Uploading file:', { fileName, filePath, fileSize: file.size, fileType: file.type });

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      if (!uploadData) {
        throw new Error('Upload failed: No data returned from storage');
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      
      if (!publicUrl) {
        throw new Error('Failed to generate public URL');
      }

      console.log('File uploaded successfully:', publicUrl);

      // Create document record
      const doc = await createDocument({
        user_id: user.id,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        ocr_text: null,
        processed: false
      });

      setDocuments([doc, ...documents]);

      toast({
        title: 'File uploaded',
        description: 'File uploaded successfully'
      });

      // Process document with OCR
      setProcessing(doc.id);

      const apiBase = getApiBaseUrl();
      let data: any;
      
      try {
        if (apiBase) {
          try {
            data = await backendJson('/api/ocr/process', {
              method: 'POST',
              body: {
                documentId: doc.id,
                fileUrl: publicUrl,
                userId: user.id
              }
            });
          } catch (backendError) {
            console.warn('Backend OCR failed, falling back to Supabase:', backendError);
            const result = await supabase.functions.invoke('ocr-process', {
              body: {
                documentId: doc.id,
                fileUrl: publicUrl,
                userId: user.id
              }
            });
            if (result.error) throw result.error;
            data = result.data;
          }
        } else {
          const result = await supabase.functions.invoke('ocr-process', {
            body: {
              documentId: doc.id,
              fileUrl: publicUrl,
              userId: user.id
            }
          });
          if (result.error) throw result.error;
          data = result.data;
        }

        // Update document status
        const { error: updateError } = await supabase
          .from('documents')
          .update({ processed: true })
          .eq('id', doc.id);

        if (updateError) throw updateError;

        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, processed: true } : d))
        );

        const transactionCount = data?.transactionCount || 0;
        toast({
          title: 'Document processed',
          description: `Extracted ${transactionCount} transactions. AI is analyzing your spending patterns to suggest a budget.`
        });
      } catch (ocrError) {
        console.error('OCR processing failed:', ocrError);
        
        // Remove failed document from list
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        
        toast({
          title: 'OCR Processing Failed',
          description: ocrError instanceof Error ? ocrError.message : 'Failed to process document. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to process document',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      setProcessing(null);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64 bg-muted" />
        <Skeleton className="h-96 bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Document Upload</h1>
        <p className="text-sm md:text-base text-muted-foreground">Upload receipts and bank statements</p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Supported formats: PDF, JPG, PNG, WEBP. Maximum file size: 1MB. Files will be automatically compressed if needed.
        </AlertDescription>
      </Alert>

      <Card className="floating-card border-none shadow-lg">
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>
            Upload receipts or bank statements to automatically extract transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Drop files here or click to upload</p>
            <p className="text-sm text-muted-foreground mb-4">
              PDF, images up to 1MB
            </p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />
            <Button asChild disabled={uploading}>
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </>
                )}
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>

      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{doc.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {processing === doc.id ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </div>
                    ) : doc.processed ? (
                      <div className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle className="h-4 w-4" />
                        Processed
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-warning">
                        <AlertCircle className="h-4 w-4" />
                        Pending
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveDocument(doc)}
                      disabled={uploading || processing === doc.id}
                      aria-label="Remove document"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
