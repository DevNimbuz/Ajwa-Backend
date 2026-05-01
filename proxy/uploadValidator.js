/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * FlyAjwa Backend — File Upload Validation
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Validates file types, sizes, and prevents malicious uploads
 */

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': { ext: '.jpg', ext2: '.jpeg' },
  'image/png': { ext: '.png' },
  'image/gif': { ext: '.gif' },
  'image/webp': { ext: '.webp' },
};

const ALLOWED_DOCUMENT_TYPES = {
  'application/pdf': { ext: '.pdf' },
  'application/msword': { ext: '.doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx' },
};

const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,      // 10MB for images
  document: 5 * 1024 * 1024,    // 5MB for documents
  video: 50 * 1024 * 1024,      // 50MB for videos
};

/**
 * Validates a single file upload
 * @param {Object} file - Multer file object
 * @param {string} type - 'image' | 'document' | 'video'
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateFile(file, type = 'image') {
  if (!file) {
    return { valid: true }; // No file is valid
  }

  const maxSize = MAX_FILE_SIZES[type] || MAX_FILE_SIZES.image;
  const allowedTypes = type === 'document' ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES;
  
  // Check MIME type
  if (!allowedTypes[file.mimetype]) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed: ${Object.keys(allowedTypes).join(', ')}` 
    };
  }
  
  // Check file size
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB` 
    };
  }
  
  // Additional check: verify file extension matches MIME type
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  const allowedExts = Object.values(allowedTypes[file.mimetype]).filter(Boolean);
  const hasValidExt = allowedExts.includes(ext);
  
  if (!hasValidExt) {
    return { 
      valid: false, 
      error: `File extension mismatch. Expected: ${allowedExts.join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * Middleware: Validate multiple file uploads
 * @param {string} fieldName - Name of the form field
 * @param {string} type - 'image' | 'document' | 'video'
 * @param {number} maxCount - Maximum number of files
 */
function validateUploads(fieldName, type = 'image', maxCount = 10) {
  return (req, res, next) => {
    const files = req.files || [];
    
    // Check file count
    if (files.length > maxCount) {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum allowed: ${maxCount}`
      });
    }
    
    // Validate each file
    for (const file of files) {
      const result = validateFile(file, type);
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: `Invalid file "${file.originalname}": ${result.error}`
        });
      }
    }
    
    next();
  };
}

/**
 * Validate a single file field (used with multer single())
 */
function validateSingleUpload(fieldName, type = 'image') {
  return (req, res, next) => {
    const file = req.file;
    const result = validateFile(file, type);
    
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }
    
    next();
  };
}

/**
 * Check filename for path traversal attempts
 */
function sanitizeFilename(filename) {
  // Remove any path components
  const sanitized = filename.replace(/^.*[\\/]/, '');
  // Remove null bytes
  return sanitized.replace(/\0/g, '');
}

module.exports = {
  validateFile,
  validateUploads,
  validateSingleUpload,
  sanitizeFilename,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_FILE_SIZES,
};
