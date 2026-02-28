
import sys
import os
from pypdf import PdfReader

def verify_pdf(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        sys.exit(1)

    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        
        text_lower = text.lower()
        
        # Forbidden terms (internal jargon that shouldn't leak)
        forbidden = [
            "orientação interna",
            "roteiro de vendas",
            "sugestão de abordagem",
            "undefined",
            "[object object]"
        ]
        
        mojibake_markers = [
            "Ã",
            "Â",
            "â€",
            "�",
        ]

        found_forbidden = []
        for term in forbidden:
            if term in text_lower:
                found_forbidden.append(term)
        
        if found_forbidden:
            print(f"FAILED: Found forbidden terms in PDF: {found_forbidden}")
            sys.exit(1)

        found_mojibake = []
        for marker in mojibake_markers:
            if marker in text:
                found_mojibake.append(marker)

        if found_mojibake:
            print(f"FAILED: Found mojibake markers in PDF: {found_mojibake}")
            sys.exit(1)
            
        # Required terms (ensure basic content is there)
        required = [
            "proposta",
            "solar",
            "garantia"
        ]
        
        missing_required = []
        for term in required:
            if term not in text_lower:
                missing_required.append(term)
                
        if missing_required:
            print(f"WARNING: Missing expected terms in PDF: {missing_required}")
            # Don't fail for this, just warn
            
        print("SUCCESS: PDF content verified. No forbidden terms found.")
        sys.exit(0)

    except Exception as e:
        print(f"Error reading PDF: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python verify_pdf_content.py <path_to_pdf>")
        sys.exit(1)
    
    verify_pdf(sys.argv[1])
