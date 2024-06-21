import React, { useState } from 'react';
import closeImg from '../../assets/close.svg';

function SearchComponent({setSearchedString}: {setSearchedString: Function}) {
    const [inputValue, setInputValue] = useState<string>('');

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(event.target.value);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // Check if the Enter key was pressed
        if (event.key === 'Enter') {
            // Call the function that handles the search
            setSearchedString(inputValue);
        }
    };

    const clearInput = () => {
        setInputValue('');
        setSearchedString(undefined);
    };

    return (
        <div className="relative flex h-full items-center">
            <input
                className="rounded-3xl bg-gray-200/30 px-4 placeholder:text-xs"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="track keyword (WIP)"
            />
            {inputValue && (
                <div className="clear-icon" onClick={clearInput}>
                    <img className="w-3 h-3" src={closeImg} />
                {/* &#x274C; is a Unicode multiplication symbol used as a clear icon */}
                </div>
            )}
        </div>
    );
}

export default SearchComponent;