"""Generate the deliberately nonbinding fixture used by owner-designated tests.

Provider field areas are defined in src/lib/mva-call/rehearsal.ts. This PDF has
no legal terms, client data, medical authorizations or representation agreement.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter

out = Path(__file__).resolve().parents[1] / 'public/esign-src/nonbinding-rehearsal-v1.pdf'
c = canvas.Canvas(str(out), pagesize=letter, invariant=1)
c.setTitle('ClaimReach NONBINDING signing rehearsal v1')
w, h = letter
navy, grey = HexColor('#172C49'), HexColor('#536277')

def line(text, y, size=11, bold=False, color=navy):
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(.12*w, h-y, text)

def field(label, y, height=.025):
    top = h * (1-y)
    c.setFillColor(grey)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(.12*w, top+7, label)
    c.setStrokeColor(HexColor('#BCC8D5'))
    c.rect(.12*w, top-height*h, .76*w, height*h, stroke=1, fill=0)

titles = ['Retainer workflow placeholder', 'HIPAA workflow placeholder', 'HITECH workflow placeholder']
for page, title in enumerate(titles, 1):
    c.setFillColor(HexColor('#FFF3CC'))
    c.rect(0, h-58, w, 58, stroke=0, fill=1)
    line('NONBINDING TEST - NO CLIENT AGREEMENT', 36, 16, True)
    line(title, 92, 19, True)
    line('ClaimReach software rehearsal only.', 120, 12, True)
    line('This document does not retain a lawyer, create representation,', 146)
    line('authorize medical records, or create any payment obligation.', 162)
    line('Use fictional TEST names and synthetic details only.', 188, 11, True)
    line('A test signature only confirms completion of this software exercise.', 204)
    if page == 1:
        for label, y in [('TEST signer name', .30), ('TEST injured party name', .38),
                         ('Fictional accident date', .46), ('Rehearsal date', .54)]:
            field(label, y)
    elif page == 2:
        field('Fictional date of birth - office step', .38)
        field('Synthetic SSN only (optional) - office step', .46)
    else:
        field('Rehearsal completion date - office step', .46)
    field('TEST SIGNATURE - NONBINDING', .64, .055)
    line('No legal effect. No real client authorization. No medical release.', 590, 11, True)
    line('This test page replaces the corresponding legal document entirely.', 613)
    line('Actual client documents must never be signed for a rehearsal.', 633)
    c.setStrokeColor(HexColor('#BCC8D5'))
    c.line(.12*w, 64, .88*w, 64)
    line(f'ClaimReach test fixture v1 | Page {page} of 3 | NONBINDING', h-45, 10, False, grey)
    c.showPage()
c.save()
print(out)
