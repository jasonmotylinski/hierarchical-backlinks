import { SearchMatchPart } from "obsidian";

import { ContentReference } from "./types";

export class SearchResultFileMatchView {

    private parent: HTMLDivElement;
    private content: string;
    private references: ContentReference[];

    constructor(parent: HTMLDivElement,  content: string, references :ContentReference[]) {
        this.parent=parent;
        this.content=content;
        this.references=references;
    }
    render(){
        const matchesDiv=this.parent.createDiv({cls: 'search-result-file-matches'});

        this.references.forEach((r)=>{
            const sorted=r.searchMatches.sort((m)=>m[0]);
            let matchesInLine: SearchMatchPart[]=[];

            for(let i=0; i < sorted.length; i++){
                
                const currentBoundary=this.findLineBoundaries(this.content, sorted[i], undefined);
                matchesInLine.push(sorted[i]);

                if(i+1 < sorted.length){
                    const nextBoundary=this.findLineBoundaries(this.content, sorted[i+1], undefined);
                    if(currentBoundary[0]==nextBoundary[0] && currentBoundary[1]==nextBoundary[1]) continue;
                }

                const matchDiv=matchesDiv.createDiv({cls: "search-result-file-match"});
                this.highlightMatches(matchDiv, this.content, currentBoundary[0], currentBoundary[1], matchesInLine);
                matchesInLine=[];

            }
        });

    }

    findLineBoundaries(text: string, indices: [number, number], maxDistance: number | undefined) {
        // Set a default value for maxDistance if it's not provided
        if (maxDistance === undefined) maxDistance = 100;
    
        // Search backwards from the starting point (indices[0] - 1) for up to 'maxDistance' characters.
        let leftIndex = indices[0] - 1;  // Start just before the first index
        let leftDistance = 0;  // Track how far we've moved to the left
        
        // Move left until we find a newline or reach the maxDistance limit
        while (leftDistance < maxDistance && leftIndex >= 0) {
            if (text.charAt(leftIndex) === '\n')  // Stop if we hit a newline
                break;
            leftIndex--;  // Move one character to the left
            leftDistance++;  // Increase the distance moved
        }
        leftIndex++;  // Move one step back to the character after the newline (or starting point)
        
        // Track if we've hit the maxDistance on the left side
        const hitMaxLeftDistance = leftDistance === maxDistance;
    
        // Search forwards from the end point (indices[1])
        let rightIndex = indices[1];  // Start at the second index
        let rightDistance = 0;  // Track how far we've moved to the right
        
        // Move right until we find a newline or reach the maxDistance limit
        while (rightDistance < maxDistance && rightIndex < text.length) {
            if (text.charAt(rightIndex) === '\n')  // Stop if we hit a newline
                break;
            rightIndex++;  // Move one character to the right
            rightDistance++;  // Increase the distance moved
        }
        
        // Track if we've hit the maxDistance on the right side
        const hitMaxRightDistance = rightDistance === maxDistance;
        
        // Return the calculated boundaries and whether we hit the distance limit
        return [leftIndex, rightIndex, hitMaxLeftDistance, hitMaxRightDistance];
    }

    highlightMatches(
        e: any, 
        fullText: string, 
        startIndex: number | boolean, 
        endIndex: number | boolean, 
        ranges: SearchMatchPart[]
    ): void {
        // Anonymous function processing ranges
        (function(lowerBound: number, upperBound: number, rangeArray: SearchMatchPart[], callback: (isMatch: boolean, from: number, to: number) => void) {
            let currentPos = lowerBound;
            for (let i = 0; i < rangeArray.length; i++) {
                let range = rangeArray[i];
                let rangeStart = range[0];

                if (rangeStart >= upperBound) break;

                let rangeEnd = range[1];

                if (rangeEnd < lowerBound) continue;

                if (rangeStart < lowerBound) rangeStart = lowerBound;
                if (rangeEnd > upperBound) rangeEnd = upperBound;

                if (rangeStart > currentPos) callback(false, currentPos, rangeStart);
                callback(true, rangeStart, rangeEnd);

                currentPos = rangeEnd;
            }

            if (currentPos < upperBound) callback(false, currentPos, upperBound);

        })(startIndex, endIndex, ranges, function(isMatch: boolean, from: number, to: number): void {
            const textSegment = fullText.substring(from, to);
            if (isMatch) {
                e.createSpan({
                    cls: "search-result-file-matched-text",
                    text: textSegment
                });
            } else {
                e.createSpan({
                    text: textSegment
                });
            }
        });
    }

}
