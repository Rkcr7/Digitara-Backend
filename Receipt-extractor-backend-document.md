# Receipt Extractor Backend

## Description

You are in charge of implementing a small application that automatically extracts information from a receipt image. The application will allow the user to upload an image of a receipt, which will be processed by an AI model to extract key details. The extracted contents will then be saved and returned to the frontend for the user to view.

## Objective

We want to implement a new service function that utilizes AI to extract details from a provided image of a receipt, and then expose this function in an API endpoint to be consumed by our frontend.

## Sample receipt images

## The backend repository includes a `sample-receipts` directory containing a variety of receipt images that you can use for testing purposes during development.

## Requirements

Within the NestJS backend provided:

1. Create a new service function, `extractReceiptDetails`  
   1. Accept an image file as an input  
      *Note: Only accept .jpg, .jpeg, .png file formats*

   2. Send the image to an AI model of your choosing, along with with a prompt instructing the model to extract and return the following information:  
      * Date  
      * Currency (3-character currency code)  
      * Vendor name  
      * Receipt items (array):  
        * Item name  
        * Item cost  
      * GST/tax (One GST/tax for the entire receipt)  
      * Total

   *Note: You can choose to use whichever AI model you prefer, via their API or SDK*

   3. Verify the response from the AI model

   4. Save the image and the details of the extraction  
      *Note: Whatever method you choose to store the extraction details and image should persist safely for any additional API endpoints or operations that might want to read or update the data*

   5. Return the details of the saved extraction  
      * `id`  
      * `date`  
      * `currency`  
      * `vendor_name`  
      * `receipt_items (array):`  
        * `item_name`  
        * `item_cost`  
      * `tax`  
      * `total`  
      * `image_url`

2. Create and expose a new `POST` endpoint, `extract-receipt-details`  
   1. Accept an image file as an input  
   2. Invoke and return the response from the `extractReceiptDetails` service function created above

3. Create a unit test for your `extractReceiptDetails` service function that covers the following scenarios:  
   1. Successful extraction from valid image  
   2. Incorrect file type  
   3. Invalid response from AI model (e.g. empty or poorly-formed)  
   4. \`500\` status response