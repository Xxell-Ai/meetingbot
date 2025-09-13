#!/usr/bin/env node

/**
 * Test script for DigitalOcean Spaces integration
 * This script tests DigitalOcean Spaces configuration for MeetingBot
 */

const { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Test configuration
const TEST_OBJECT_KEY = 'test-storage-integration.txt';
const TEST_CONTENT = 'MeetingBot Storage Integration Test - ' + new Date().toISOString();

/**
 * Create S3 client for DigitalOcean Spaces
 */
function createDOSpacesClient() {
  return new S3Client({
    region: process.env.DO_SPACES_REGION || 'sgp1',
    endpoint: process.env.DO_SPACES_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  });
}

/**
 * Create S3 client for AWS S3
 */
function createAWSS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Test storage provider
 */
async function testStorageProvider(client, providerName, bucketName) {
  console.log(`\n🧪 Testing ${providerName}...`);
  
  try {
    // Test 1: List buckets (connection test)
    console.log('  ✓ Testing connection...');
    const listCommand = new ListBucketsCommand({});
    const buckets = await client.send(listCommand);
    console.log(`  ✓ Connection successful. Found ${buckets.Buckets?.length || 0} buckets.`);
    
    // Verify target bucket exists
    const targetBucket = buckets.Buckets?.find(b => b.Name === bucketName);
    if (!targetBucket) {
      throw new Error(`Target bucket '${bucketName}' not found`);
    }
    console.log(`  ✓ Target bucket '${bucketName}' found.`);
    
    // Test 2: Upload test object
    console.log('  ✓ Testing upload...');
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: TEST_OBJECT_KEY,
      Body: TEST_CONTENT,
      ContentType: 'text/plain',
    });
    await client.send(putCommand);
    console.log(`  ✓ Upload successful: ${TEST_OBJECT_KEY}`);
    
    // Test 3: Generate signed URL
    console.log('  ✓ Testing signed URL generation...');
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: TEST_OBJECT_KEY,
    });
    const signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 3600 });
    console.log(`  ✓ Signed URL generated: ${signedUrl.substring(0, 100)}...`);
    
    // Test 4: Download test object
    console.log('  ✓ Testing download...');
    const getResult = await client.send(getCommand);
    const downloadedContent = await getResult.Body.transformToString();
    if (downloadedContent !== TEST_CONTENT) {
      throw new Error('Downloaded content does not match uploaded content');
    }
    console.log('  ✓ Download successful and content verified.');
    
    // Test 5: Cleanup - delete test object
    console.log('  ✓ Cleaning up...');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: TEST_OBJECT_KEY,
    });
    await client.send(deleteCommand);
    console.log('  ✓ Cleanup successful.');
    
    console.log(`✅ ${providerName} integration test PASSED`);
    return true;
    
  } catch (error) {
    console.error(`❌ ${providerName} integration test FAILED:`, error.message);
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 MeetingBot Storage Integration Test');
  console.log('=====================================');
  
  // Check required environment variables
  const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`❌ Missing required environment variable: ${varName}`);
      process.exit(1);
    }
  }
  
  let allTestsPassed = true;
  
  // Test DigitalOcean Spaces
  if (process.env.DO_SPACES_BUCKET) {
    const doClient = createDOSpacesClient();
    const doResult = await testStorageProvider(doClient, 'DigitalOcean Spaces', process.env.DO_SPACES_BUCKET);
    allTestsPassed = allTestsPassed && doResult;
  } else {
    console.error('❌ DO_SPACES_BUCKET environment variable is required');
    process.exit(1);
  }
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  if (allTestsPassed) {
    console.log('✅ DigitalOcean Spaces integration test PASSED');
    console.log('🎉 DigitalOcean Spaces configuration is working correctly!');
    process.exit(0);
  } else {
    console.log('❌ DigitalOcean Spaces integration test FAILED');
    console.log('🔧 Please check your DigitalOcean Spaces configuration and credentials.');
    process.exit(1);
  }
}

// Handle command line usage
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { testStorageProvider, createDOSpacesClient, createAWSS3Client };
